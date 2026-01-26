import { readFile, readdir, writeFile, stat } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { existsSync } from 'fs'
import { watch, FSWatcher } from 'chokidar'
import matter from 'gray-matter'
import { EventEmitter } from 'events'
import { config } from '../config'
import type { RalphLoop, RalphSpec, SteeringQuestion, RalphProgress, RalphSummary } from '../../src/types'

// Paths to search for Ralph state files (from config)
const SEARCH_PATHS = [
  config.homeDir,
  join(config.homeDir, config.projectsDir),
]

// Events emitted by RalphWatcher
export interface RalphWatcherEvents {
  'loop:update': (loop: RalphLoop) => void
  'loop:removed': (taskId: string) => void
  'spec:update': (spec: RalphSpec) => void
  'spec:created': (data: { taskId: string; spec: RalphSpec; projectPath: string }) => void
  'progress:update': (taskId: string, progress: RalphProgress) => void
  'steering:pending': (taskId: string, steering: SteeringQuestion) => void
  'steering:answered': (taskId: string, steering: SteeringQuestion) => void
  'summary:created': (taskId: string, summary: RalphSummary) => void
}

export class RalphWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private watching = false
  // Track specs we've seen to only emit spec:created for new ones
  private seenSpecs = new Set<string>()

  /**
   * Parse a spec file into a RalphSpec object
   */
  parseSpecFile(filepath: string, content: string): RalphSpec | null {
    try {
      const { data: frontmatter, content: body } = matter(content)

      // Extract task ID from filename
      const filename = basename(filepath)
      const match = filename.match(/ralph-spec-(.+)\.md/)
      const taskId = match ? match[1] : 'unknown'

      // Extract first paragraph as summary (skip empty lines)
      const lines = body.trim().split('\n')
      let summary = ''
      for (const line of lines) {
        const trimmed = line.trim()
        // Skip headers and empty lines
        if (trimmed && !trimmed.startsWith('#')) {
          summary = trimmed
          break
        }
      }

      return {
        taskId,
        maxIterations: frontmatter.max_iterations || 50,
        completionPromise: frontmatter.completion_promise || null,
        mode: frontmatter.mode || 'yolo',
        taskContent: body.trim(),
        taskSummary: summary.slice(0, 200) + (summary.length > 200 ? '...' : ''),
        specFile: filepath,
      }
    } catch (error) {
      console.error(`Error parsing spec file ${filepath}:`, error)
      return null
    }
  }

  /**
   * Parse a steering file into a SteeringQuestion object
   */
  parseSteeringFile(filepath: string, content: string): SteeringQuestion | null {
    try {
      const { data: frontmatter, content: body } = matter(content)

      // Extract task ID from filename
      const filename = basename(filepath)
      const match = filename.match(/ralph-steering-(.+)\.md/)
      const taskId = match ? match[1] : 'unknown'

      // Parse markdown sections
      const questionMatch = body.match(/## Question\s*\n\n?([\s\S]*?)(?=\n##|---|\n*$)/)
      const contextMatch = body.match(/## Context\s*\n\n?([\s\S]*?)(?=\n##|---|\n*$)/)
      const optionsMatch = body.match(/## Options\s*\n\n?([\s\S]*?)(?=\n##|---|\n*$)/)
      const responseMatch = body.match(/## Response\s*\n\n?([\s\S]*?)$/)

      // Parse options list (numbered or bulleted)
      let options: string[] | undefined
      if (optionsMatch && optionsMatch[1]) {
        const optionsText = optionsMatch[1].trim()
        const optionLines = optionsText.split('\n').filter(l => l.trim())
        options = optionLines.map(line =>
          line.replace(/^\d+\.\s*/, '').replace(/^[-*]\s*/, '').trim()
        ).filter(o => o.length > 0)
        if (options.length === 0) options = undefined
      }

      // Get response if answered
      let response: string | undefined
      if (responseMatch && responseMatch[1]) {
        const responseText = responseMatch[1].trim()
        if (responseText && !responseText.includes('_Waiting for response')) {
          response = responseText
        }
      }

      return {
        taskId,
        status: frontmatter.status || 'pending',
        iteration: frontmatter.iteration || 0,
        timestamp: frontmatter.timestamp || new Date().toISOString(),
        question: questionMatch?.[1]?.trim() || 'No question specified',
        context: contextMatch?.[1]?.trim() || undefined,
        options,
        response,
      }
    } catch (error) {
      console.error(`Error parsing steering file ${filepath}:`, error)
      return null
    }
  }

  /**
   * Parse a progress file into a RalphProgress object
   */
  parseProgressFile(filepath: string, content: string): RalphProgress | null {
    try {
      // Extract task ID from filename
      const filename = basename(filepath)
      const match = filename.match(/ralph-progress-(.+)\.md/)
      const taskId = match ? match[1] : 'unknown'

      // Extract first paragraph as summary
      const lines = content.trim().split('\n')
      let summary = ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          summary = trimmed
          break
        }
      }

      return {
        taskId,
        content: content.trim(),
        summary: summary.slice(0, 200) + (summary.length > 200 ? '...' : ''),
        lastUpdate: new Date(),
      }
    } catch (error) {
      console.error(`Error parsing progress file ${filepath}:`, error)
      return null
    }
  }

  /**
   * Parse a summary file into a RalphSummary object
   */
  parseSummaryFile(filepath: string, content: string): RalphSummary | null {
    try {
      // Extract task ID from filename
      const filename = basename(filepath)
      const match = filename.match(/ralph-summary-(.+)\.md/)
      const taskId = match ? match[1] : 'unknown'

      // Try to detect outcome from content
      let outcome: RalphSummary['outcome'] = 'unknown'
      const lowerContent = content.toLowerCase()
      if (lowerContent.includes('success') || lowerContent.includes('complete')) {
        outcome = 'success'
      } else if (lowerContent.includes('fail') || lowerContent.includes('error')) {
        outcome = 'failure'
      } else if (lowerContent.includes('partial')) {
        outcome = 'partial'
      }

      return {
        taskId,
        content: content.trim(),
        outcome,
        completedAt: new Date(),
      }
    } catch (error) {
      console.error(`Error parsing summary file ${filepath}:`, error)
      return null
    }
  }

  /**
   * Start watching for Ralph file changes
   */
  startWatching(): void {
    if (this.watching) return
    this.watching = true

    // Build glob patterns for all Ralph-related files and log directories
    const patterns = SEARCH_PATHS.flatMap(basePath => [
      join(basePath, '.claude', 'ralph-loop-*.local.md'),
      join(basePath, '.claude', 'ralph-spec-*.md'),
      join(basePath, '.claude', 'ralph-progress-*.md'),
      join(basePath, '.claude', 'ralph-steering-*.md'),
      join(basePath, '.claude', 'ralph-summary-*.md'),
      join(basePath, '.claude', 'ralph-logs-*', 'iteration-*.log'),
      join(basePath, '*', '.claude', 'ralph-loop-*.local.md'),
      join(basePath, '*', '.claude', 'ralph-spec-*.md'),
      join(basePath, '*', '.claude', 'ralph-progress-*.md'),
      join(basePath, '*', '.claude', 'ralph-steering-*.md'),
      join(basePath, '*', '.claude', 'ralph-summary-*.md'),
      join(basePath, '*', '.claude', 'ralph-logs-*', 'iteration-*.log'),
    ])

    this.watcher = watch(patterns, {
      ignoreInitial: false,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    })

    this.watcher.on('add', (path) => this.handleFileChange(path, 'add'))
    this.watcher.on('change', (path) => this.handleFileChange(path, 'change'))
    this.watcher.on('unlink', (path) => this.handleFileRemove(path))
    this.watcher.on('error', (error) => console.error('Ralph watcher error:', error))

    console.log('Ralph watcher started')
  }

  /**
   * Stop watching for file changes
   */
  async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
      this.watching = false
      console.log('Ralph watcher stopped')
    }
  }

  /**
   * Handle file add/change events
   */
  private async handleFileChange(filepath: string, event: 'add' | 'change'): Promise<void> {
    const filename = basename(filepath)

    try {
      // Ralph loop state files (persistent mode)
      if (filename.startsWith('ralph-loop-') && filename.endsWith('.local.md')) {
        const loop = await this.parseStateFile(filepath)
        if (loop) {
          this.emit('loop:update', loop)
        }
      }
      // Spec files - check for fresh mode loop and emit spec:created for new specs
      else if (filename.startsWith('ralph-spec-') && filename.endsWith('.md')) {
        const content = await readFile(filepath, 'utf-8')
        const spec = this.parseSpecFile(filepath, content)
        if (spec) {
          this.emit('spec:update', spec)

          // For new spec files (add event), check if we should emit spec:created
          if (event === 'add' && !this.seenSpecs.has(spec.taskId)) {
            this.seenSpecs.add(spec.taskId)

            // Check if there's an active loop for this spec
            const hasActiveLoop = await this.hasActiveLoop(filepath, spec.taskId)
            if (!hasActiveLoop) {
              // Emit spec:created for auto-launch notification
              const projectPath = dirname(dirname(filepath)) // parent of .claude dir
              this.emit('spec:created', {
                taskId: spec.taskId,
                spec,
                projectPath
              })
            }
          }

          // Check if this is a fresh mode loop (has logs but no state file)
          await this.checkFreshModeLoop(filepath, spec)
        }
      }
      // Iteration log files - fresh mode loop activity
      else if (filename.startsWith('iteration-') && filename.endsWith('.log')) {
        // Extract task ID from parent directory name: ralph-logs-{task-id}
        const logsDir = basename(dirname(filepath))
        const match = logsDir.match(/ralph-logs-(.+)/)
        if (match) {
          const taskId = match[1]
          await this.emitFreshModeLoopUpdate(dirname(filepath), taskId)
        }
      }
      // Progress files
      else if (filename.startsWith('ralph-progress-') && filename.endsWith('.md')) {
        const match = filename.match(/ralph-progress-(.+)\.md/)
        if (match) {
          const content = await readFile(filepath, 'utf-8')
          const progress = this.parseProgressFile(filepath, content)
          if (progress) {
            this.emit('progress:update', match[1], progress)
          }
        }
      }
      // Steering files
      else if (filename.startsWith('ralph-steering-') && filename.endsWith('.md')) {
        const match = filename.match(/ralph-steering-(.+)\.md/)
        if (match) {
          const content = await readFile(filepath, 'utf-8')
          const steering = this.parseSteeringFile(filepath, content)
          if (steering) {
            if (steering.status === 'pending') {
              this.emit('steering:pending', match[1], steering)
            } else {
              this.emit('steering:answered', match[1], steering)
            }
          }
        }
      }
      // Summary files
      else if (filename.startsWith('ralph-summary-') && filename.endsWith('.md')) {
        const match = filename.match(/ralph-summary-(.+)\.md/)
        if (match) {
          const content = await readFile(filepath, 'utf-8')
          const summary = this.parseSummaryFile(filepath, content)
          if (summary) {
            this.emit('summary:created', match[1], summary)
          }
        }
      }
    } catch (error) {
      console.error(`Error handling file ${filepath}:`, error)
    }
  }

  /**
   * Check if there's an active loop for a given task ID
   * Returns true if state file exists OR logs directory has recent activity
   */
  private async hasActiveLoop(specPath: string, taskId: string): Promise<boolean> {
    const dir = dirname(specPath)
    const stateFile = join(dir, `ralph-loop-${taskId}.local.md`)
    const logsDir = join(dir, `ralph-logs-${taskId}`)

    // Check for persistent mode state file
    if (existsSync(stateFile)) {
      return true
    }

    // Check for fresh mode logs with recent activity
    if (existsSync(logsDir)) {
      try {
        const logFiles = await readdir(logsDir)
        const iterationFiles = logFiles.filter(f => f.startsWith('iteration-') && f.endsWith('.log'))

        if (iterationFiles.length > 0) {
          // Check if any log file was modified recently (within 5 minutes)
          for (const logFile of iterationFiles) {
            const logPath = join(logsDir, logFile)
            const logStat = await stat(logPath)
            const age = Date.now() - logStat.mtime.getTime()
            if (age < 5 * 60 * 1000) {
              return true // Active loop detected
            }
          }
        }
      } catch {
        // Ignore errors reading logs
      }
    }

    return false
  }

  /**
   * Check if spec file is associated with a fresh mode loop
   */
  private async checkFreshModeLoop(specPath: string, spec: RalphSpec): Promise<void> {
    const dir = dirname(specPath)
    const stateFile = join(dir, `ralph-loop-${spec.taskId}.local.md`)
    const logsDir = join(dir, `ralph-logs-${spec.taskId}`)

    // If state file exists, this is persistent mode - handled by state file watcher
    if (existsSync(stateFile)) {
      return
    }

    // Check for logs directory (indicates fresh mode loop has run)
    if (existsSync(logsDir)) {
      await this.emitFreshModeLoopUpdate(logsDir, spec.taskId, spec)
    }
  }

  /**
   * Emit loop update for a fresh mode loop based on logs directory
   */
  private async emitFreshModeLoopUpdate(logsDir: string, taskId: string, spec?: RalphSpec): Promise<void> {
    try {
      const dir = dirname(logsDir) // .claude directory
      const projectPath = dirname(dir)

      // Get spec if not provided
      if (!spec) {
        const specPath = join(dir, `ralph-spec-${taskId}.md`)
        if (existsSync(specPath)) {
          const content = await readFile(specPath, 'utf-8')
          spec = this.parseSpecFile(specPath, content) || undefined
        }
      }

      // Parse iteration count from log files
      const logFiles = await readdir(logsDir)
      const iterationFiles = logFiles
        .filter(f => f.startsWith('iteration-') && f.endsWith('.log'))
        .map(f => {
          const match = f.match(/iteration-(\d+)\.log/)
          return match ? parseInt(match[1], 10) : 0
        })
        .sort((a, b) => b - a)

      const currentIteration = iterationFiles[0] || 0
      const maxIterations = spec?.maxIterations || 50

      // Check if loop is still running by checking latest log file modification time
      let status: RalphLoop['status'] = 'running'
      if (iterationFiles.length > 0) {
        const latestLog = join(logsDir, `iteration-${currentIteration}.log`)
        try {
          const logStat = await stat(latestLog)
          const age = Date.now() - logStat.mtime.getTime()
          // If latest log is older than 5 minutes, loop is likely not running
          if (age > 5 * 60 * 1000) {
            status = currentIteration >= maxIterations ? 'max_reached' : 'completed'
          }
        } catch {
          // Ignore stat errors
        }
      }

      // Check for steering file
      const steeringFile = join(dir, `ralph-steering-${taskId}.md`)
      let steeringStatus: 'none' | 'pending' | 'answered' = 'none'
      if (existsSync(steeringFile)) {
        const steeringContent = await readFile(steeringFile, 'utf-8')
        if (steeringContent.includes('status: pending')) {
          steeringStatus = 'pending'
        } else if (steeringContent.includes('status: answered')) {
          steeringStatus = 'answered'
        }
      }

      // Get first log file timestamp for startedAt
      let startedAt = new Date()
      if (iterationFiles.length > 0) {
        const firstLog = join(logsDir, `iteration-1.log`)
        if (existsSync(firstLog)) {
          try {
            const firstLogStat = await stat(firstLog)
            startedAt = firstLogStat.birthtime
          } catch {
            // Use current time as fallback
          }
        }
      }

      const loop: RalphLoop = {
        taskId,
        projectPath,
        iteration: currentIteration,
        maxIterations,
        completionPromise: spec?.completionPromise || null,
        mode: spec?.mode || 'yolo',
        startedAt,
        stateFile: null, // Fresh mode has no state file
        progressFile: existsSync(join(dir, `ralph-progress-${taskId}.md`))
          ? join(dir, `ralph-progress-${taskId}.md`)
          : null,
        steeringFile: existsSync(steeringFile) ? steeringFile : null,
        steeringStatus,
        status,
        loopType: 'fresh',
        spec,
        logsDir,
      }

      this.emit('loop:update', loop)
    } catch (error) {
      console.error(`Error emitting fresh mode loop update for ${taskId}:`, error)
    }
  }

  /**
   * Handle file removal
   */
  private handleFileRemove(filepath: string): void {
    const filename = basename(filepath)

    if (filename.startsWith('ralph-loop-') && filename.endsWith('.local.md')) {
      const match = filename.match(/ralph-loop-(.+)\.local\.md/)
      if (match) {
        this.emit('loop:removed', match[1])
      }
    }
  }

  /**
   * Find all Ralph loop state files (persistent mode)
   */
  private async findStateFiles(): Promise<string[]> {
    const files: string[] = []

    for (const basePath of SEARCH_PATHS) {
      try {
        // Check .claude directory directly
        const claudeDir = join(basePath, '.claude')
        if (existsSync(claudeDir)) {
          const dirFiles = await readdir(claudeDir)
          for (const file of dirFiles) {
            if (file.startsWith('ralph-loop-') && file.endsWith('.local.md')) {
              files.push(join(claudeDir, file))
            }
          }
        }

        // Check project subdirectories
        if (existsSync(basePath)) {
          const subdirs = await readdir(basePath)
          for (const subdir of subdirs) {
            const projectClaudeDir = join(basePath, subdir, '.claude')
            if (existsSync(projectClaudeDir)) {
              const dirFiles = await readdir(projectClaudeDir)
              for (const file of dirFiles) {
                if (file.startsWith('ralph-loop-') && file.endsWith('.local.md')) {
                  files.push(join(projectClaudeDir, file))
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Error scanning directory ${basePath} for state files:`, error)
      }
    }

    return files
  }

  /**
   * Find all Ralph spec files (for fresh mode detection)
   */
  private async findSpecFiles(): Promise<string[]> {
    const files: string[] = []

    for (const basePath of SEARCH_PATHS) {
      try {
        // Check .claude directory directly
        const claudeDir = join(basePath, '.claude')
        if (existsSync(claudeDir)) {
          const dirFiles = await readdir(claudeDir)
          for (const file of dirFiles) {
            if (file.startsWith('ralph-spec-') && file.endsWith('.md')) {
              files.push(join(claudeDir, file))
            }
          }
        }

        // Check project subdirectories
        if (existsSync(basePath)) {
          const subdirs = await readdir(basePath)
          for (const subdir of subdirs) {
            const projectClaudeDir = join(basePath, subdir, '.claude')
            if (existsSync(projectClaudeDir)) {
              const dirFiles = await readdir(projectClaudeDir)
              for (const file of dirFiles) {
                if (file.startsWith('ralph-spec-') && file.endsWith('.md')) {
                  files.push(join(projectClaudeDir, file))
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Error scanning directory ${basePath} for spec files:`, error)
      }
    }

    return files
  }

  /**
   * Parse a Ralph state file into a RalphLoop object (persistent mode)
   */
  private async parseStateFile(filepath: string): Promise<RalphLoop | null> {
    try {
      const content = await readFile(filepath, 'utf-8')
      const { data: frontmatter } = matter(content)

      // Extract task ID from filename
      const filename = basename(filepath)
      const match = filename.match(/ralph-loop-(.+)\.local\.md/)
      const taskId = match ? match[1] : 'unknown'

      // Check for steering file
      const dir = dirname(filepath)
      const steeringFile = join(dir, `ralph-steering-${taskId}.md`)
      let steeringStatus: 'none' | 'pending' | 'answered' = 'none'

      if (existsSync(steeringFile)) {
        const steeringContent = await readFile(steeringFile, 'utf-8')
        if (steeringContent.includes('status: pending')) {
          steeringStatus = 'pending'
        } else if (steeringContent.includes('status: answered')) {
          steeringStatus = 'answered'
        }
      }

      // Determine status
      let status: RalphLoop['status'] = 'running'
      if (frontmatter.completed) {
        status = 'completed'
      } else if (frontmatter.cancelled) {
        status = 'cancelled'
      } else if (
        frontmatter.max_iterations &&
        frontmatter.iteration >= frontmatter.max_iterations
      ) {
        status = 'max_reached'
      }

      // Try to get spec
      let spec: RalphSpec | undefined
      const specPath = join(dir, `ralph-spec-${taskId}.md`)
      if (existsSync(specPath)) {
        const specContent = await readFile(specPath, 'utf-8')
        spec = this.parseSpecFile(specPath, specContent) || undefined
      }

      return {
        taskId,
        projectPath: dir,
        iteration: frontmatter.iteration || 0,
        maxIterations: frontmatter.max_iterations || 0,
        completionPromise: frontmatter.completion_promise || null,
        mode: frontmatter.mode || 'yolo',
        startedAt: frontmatter.started_at
          ? new Date(frontmatter.started_at)
          : new Date(),
        stateFile: filepath,
        progressFile: existsSync(join(dir, `ralph-progress-${taskId}.md`))
          ? join(dir, `ralph-progress-${taskId}.md`)
          : null,
        steeringFile: existsSync(steeringFile) ? steeringFile : null,
        steeringStatus,
        status,
        loopType: 'persistent',
        spec,
      }
    } catch (error) {
      console.error(`Error parsing state file ${filepath}:`, error)
      return null
    }
  }

  /**
   * List all active Ralph loops (both persistent and fresh mode)
   */
  async listLoops(): Promise<RalphLoop[]> {
    const loops: RalphLoop[] = []
    const seenTaskIds = new Set<string>()

    // Find persistent mode loops
    const stateFiles = await this.findStateFiles()
    for (const file of stateFiles) {
      const loop = await this.parseStateFile(file)
      if (loop) {
        loops.push(loop)
        seenTaskIds.add(loop.taskId)
      }
    }

    // Find fresh mode loops (spec files with logs but no state file)
    const specFiles = await this.findSpecFiles()
    for (const specPath of specFiles) {
      const specContent = await readFile(specPath, 'utf-8')
      const spec = this.parseSpecFile(specPath, specContent)
      if (!spec || seenTaskIds.has(spec.taskId)) continue

      const dir = dirname(specPath)
      const stateFile = join(dir, `ralph-loop-${spec.taskId}.local.md`)
      const logsDir = join(dir, `ralph-logs-${spec.taskId}`)

      // Skip if state file exists (already handled as persistent)
      if (existsSync(stateFile)) continue

      // Check for logs directory (indicates fresh mode loop)
      if (existsSync(logsDir)) {
        try {
          const logFiles = await readdir(logsDir)
          if (logFiles.some(f => f.startsWith('iteration-'))) {
            // Build fresh mode loop info
            const iterationFiles = logFiles
              .filter(f => f.startsWith('iteration-') && f.endsWith('.log'))
              .map(f => {
                const match = f.match(/iteration-(\d+)\.log/)
                return match ? parseInt(match[1], 10) : 0
              })
              .sort((a, b) => b - a)

            const currentIteration = iterationFiles[0] || 0

            // Check if running
            let status: RalphLoop['status'] = 'running'
            if (iterationFiles.length > 0) {
              const latestLog = join(logsDir, `iteration-${currentIteration}.log`)
              try {
                const logStat = await stat(latestLog)
                const age = Date.now() - logStat.mtime.getTime()
                if (age > 5 * 60 * 1000) {
                  status = currentIteration >= spec.maxIterations ? 'max_reached' : 'completed'
                }
              } catch {
                // Ignore
              }
            }

            // Check steering
            const steeringFile = join(dir, `ralph-steering-${spec.taskId}.md`)
            let steeringStatus: 'none' | 'pending' | 'answered' = 'none'
            if (existsSync(steeringFile)) {
              const steeringContent = await readFile(steeringFile, 'utf-8')
              if (steeringContent.includes('status: pending')) {
                steeringStatus = 'pending'
              } else if (steeringContent.includes('status: answered')) {
                steeringStatus = 'answered'
              }
            }

            // Get start time
            let startedAt = new Date()
            const firstLog = join(logsDir, 'iteration-1.log')
            if (existsSync(firstLog)) {
              try {
                const firstLogStat = await stat(firstLog)
                startedAt = firstLogStat.birthtime
              } catch {
                // Use current
              }
            }

            loops.push({
              taskId: spec.taskId,
              projectPath: dirname(dir),
              iteration: currentIteration,
              maxIterations: spec.maxIterations,
              completionPromise: spec.completionPromise,
              mode: spec.mode,
              startedAt,
              stateFile: null,
              progressFile: existsSync(join(dir, `ralph-progress-${spec.taskId}.md`))
                ? join(dir, `ralph-progress-${spec.taskId}.md`)
                : null,
              steeringFile: existsSync(steeringFile) ? steeringFile : null,
              steeringStatus,
              status,
              loopType: 'fresh',
              spec,
              logsDir,
            })
          }
        } catch (error) {
          console.warn(`Error reading logs directory ${logsDir}:`, error)
        }
      }
    }

    // Sort by most recent first
    loops.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())

    return loops
  }

  /**
   * Get a specific loop by task ID
   */
  async getLoop(taskId: string): Promise<RalphLoop | null> {
    const loops = await this.listLoops()
    return loops.find(l => l.taskId === taskId) || null
  }

  /**
   * Get progress file content
   */
  async getProgress(taskId: string): Promise<RalphProgress | null> {
    const loop = await this.getLoop(taskId)
    if (!loop || !loop.progressFile) {
      return null
    }

    try {
      const content = await readFile(loop.progressFile, 'utf-8')
      return this.parseProgressFile(loop.progressFile, content)
    } catch (error) {
      console.warn(`Error reading progress file for ${taskId}:`, error)
      return null
    }
  }

  /**
   * Get steering question content
   */
  async getSteering(taskId: string): Promise<SteeringQuestion | null> {
    const loop = await this.getLoop(taskId)
    if (!loop || !loop.steeringFile) {
      return null
    }

    try {
      const content = await readFile(loop.steeringFile, 'utf-8')
      return this.parseSteeringFile(loop.steeringFile, content)
    } catch (error) {
      console.warn(`Error reading steering file for ${taskId}:`, error)
      return null
    }
  }

  /**
   * Answer a steering question
   */
  async answerSteering(taskId: string, response: string): Promise<void> {
    const loop = await this.getLoop(taskId)
    if (!loop || !loop.steeringFile) {
      throw new Error('Loop or steering file not found')
    }

    const content = await readFile(loop.steeringFile, 'utf-8')
    const updated = content
      .replace('status: pending', 'status: answered')
      .replace(
        /## Response\n\n_Waiting for response\.\.\._/,
        `## Response\n\n${response}`
      )

    await writeFile(loop.steeringFile, updated, 'utf-8')
  }

  /**
   * Cancel a loop by marking it as cancelled (persistent mode only)
   */
  async cancelLoop(taskId: string): Promise<void> {
    const loop = await this.getLoop(taskId)
    if (!loop) {
      throw new Error('Loop not found')
    }

    if (!loop.stateFile) {
      throw new Error('Cannot cancel fresh mode loop - kill the ralph process instead')
    }

    const content = await readFile(loop.stateFile, 'utf-8')
    const { data: frontmatter, content: body } = matter(content)

    frontmatter.cancelled = true
    frontmatter.cancelled_at = new Date().toISOString()

    const updated = matter.stringify(body, frontmatter)
    await writeFile(loop.stateFile, updated, 'utf-8')
  }
}
