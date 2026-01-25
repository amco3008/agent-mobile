import { readFile, readdir, writeFile } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { existsSync } from 'fs'
import { watch, FSWatcher } from 'chokidar'
import matter from 'gray-matter'
import { EventEmitter } from 'events'
import { config } from '../config'
import type { RalphLoop } from '../../src/types'

// Paths to search for Ralph state files (from config)
const SEARCH_PATHS = [
  config.homeDir,
  join(config.homeDir, config.projectsDir),
]

// Events emitted by RalphWatcher
export interface RalphWatcherEvents {
  'loop:update': (loop: RalphLoop) => void
  'loop:removed': (taskId: string) => void
  'progress:update': (taskId: string, content: string) => void
  'steering:pending': (taskId: string, content: string) => void
  'steering:answered': (taskId: string, content: string) => void
  'summary:created': (taskId: string, content: string) => void
}

export class RalphWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private watching = false

  /**
   * Start watching for Ralph file changes
   */
  startWatching(): void {
    if (this.watching) return
    this.watching = true

    // Build glob patterns for all Ralph-related files
    const patterns = SEARCH_PATHS.flatMap(basePath => [
      join(basePath, '.claude', 'ralph-loop-*.local.md'),
      join(basePath, '.claude', 'ralph-spec-*.md'),
      join(basePath, '.claude', 'ralph-progress-*.md'),
      join(basePath, '.claude', 'ralph-steering-*.md'),
      join(basePath, '.claude', 'ralph-summary-*.md'),
      join(basePath, '*', '.claude', 'ralph-loop-*.local.md'),
      join(basePath, '*', '.claude', 'ralph-spec-*.md'),
      join(basePath, '*', '.claude', 'ralph-progress-*.md'),
      join(basePath, '*', '.claude', 'ralph-steering-*.md'),
      join(basePath, '*', '.claude', 'ralph-summary-*.md'),
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
      // Ralph loop state files
      if (filename.startsWith('ralph-loop-') && filename.endsWith('.local.md')) {
        const loop = await this.parseStateFile(filepath)
        if (loop) {
          this.emit('loop:update', loop)
        }
      }
      // Progress files
      else if (filename.startsWith('ralph-progress-') && filename.endsWith('.md')) {
        const match = filename.match(/ralph-progress-(.+)\.md/)
        if (match) {
          const content = await readFile(filepath, 'utf-8')
          this.emit('progress:update', match[1], content)
        }
      }
      // Steering files
      else if (filename.startsWith('ralph-steering-') && filename.endsWith('.md')) {
        const match = filename.match(/ralph-steering-(.+)\.md/)
        if (match) {
          const content = await readFile(filepath, 'utf-8')
          if (content.includes('status: pending')) {
            this.emit('steering:pending', match[1], content)
          } else if (content.includes('status: answered')) {
            this.emit('steering:answered', match[1], content)
          }
        }
      }
      // Summary files
      else if (filename.startsWith('ralph-summary-') && filename.endsWith('.md')) {
        const match = filename.match(/ralph-summary-(.+)\.md/)
        if (match) {
          const content = await readFile(filepath, 'utf-8')
          this.emit('summary:created', match[1], content)
        }
      }
    } catch (error) {
      console.error(`Error handling file ${filepath}:`, error)
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
   * Find all Ralph loop state files
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
      } catch {
        // Ignore errors for missing directories
      }
    }

    return files
  }

  /**
   * Parse a Ralph state file into a RalphLoop object
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
      const dir = join(filepath, '..')
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
      }
    } catch (error) {
      console.error(`Error parsing state file ${filepath}:`, error)
      return null
    }
  }

  /**
   * List all active Ralph loops
   */
  async listLoops(): Promise<RalphLoop[]> {
    const files = await this.findStateFiles()
    const loops: RalphLoop[] = []

    for (const file of files) {
      const loop = await this.parseStateFile(file)
      if (loop) {
        loops.push(loop)
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
  async getProgress(taskId: string): Promise<string | null> {
    const loop = await this.getLoop(taskId)
    if (!loop || !loop.progressFile) {
      return null
    }

    try {
      return await readFile(loop.progressFile, 'utf-8')
    } catch {
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
   * Cancel a loop by marking it as cancelled
   */
  async cancelLoop(taskId: string): Promise<void> {
    const loop = await this.getLoop(taskId)
    if (!loop) {
      throw new Error('Loop not found')
    }

    const content = await readFile(loop.stateFile, 'utf-8')
    const { data: frontmatter, content: body } = matter(content)

    frontmatter.cancelled = true
    frontmatter.cancelled_at = new Date().toISOString()

    const updated = matter.stringify(body, frontmatter)
    await writeFile(loop.stateFile, updated, 'utf-8')
  }
}
