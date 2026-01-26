import { remoteExecService } from './RemoteExecService'
import type { RalphLoop, RalphSpec, SteeringQuestion, RalphProgress, RalphSummary } from '../../src/types'

/**
 * Service for reading Ralph files from remote containers via docker exec
 * Mirrors RalphWatcher functionality but for remote containers
 */
export class RemoteRalphService {
  private claudeDir = '/home/agent/.claude'

  /**
   * List all Ralph loops in a container (both persistent and fresh modes)
   */
  async listLoops(containerId: string): Promise<RalphLoop[]> {
    const loops: RalphLoop[] = []

    // Get persistent mode loops (ralph-loop-*.local.md)
    const persistentLoops = await this.listPersistentLoops(containerId)
    loops.push(...persistentLoops)

    // Get fresh mode loops (specs without state files but with recent logs)
    const freshLoops = await this.listFreshLoops(containerId, persistentLoops)
    loops.push(...freshLoops)

    return loops
  }

  /**
   * List persistent mode loops (have state files)
   */
  private async listPersistentLoops(containerId: string): Promise<RalphLoop[]> {
    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `ls -1 ${this.claudeDir}/ralph-loop-*.local.md 2>/dev/null || true`,
    ])

    if (!result.success || !result.output?.trim()) {
      return []
    }

    const loops: RalphLoop[] = []
    const files = result.output.trim().split('\n').filter(Boolean)

    for (const file of files) {
      const loop = await this.parseLoopStateFile(containerId, file)
      if (loop) {
        loops.push(loop)
      }
    }

    return loops
  }

  /**
   * List fresh mode loops (specs with logs but no state file)
   */
  private async listFreshLoops(
    containerId: string,
    existingLoops: RalphLoop[]
  ): Promise<RalphLoop[]> {
    const existingTaskIds = new Set(existingLoops.map((l) => l.taskId))

    // Find spec files
    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `ls -1 ${this.claudeDir}/ralph-spec-*.md 2>/dev/null | grep -v '.local.md' || true`,
    ])

    if (!result.success || !result.output?.trim()) {
      return []
    }

    const loops: RalphLoop[] = []
    const specFiles = result.output.trim().split('\n').filter(Boolean)

    for (const specFile of specFiles) {
      // Extract taskId from filename
      const match = specFile.match(/ralph-spec-([^/]+)\.md$/)
      if (!match) continue

      const taskId = match[1]

      // Skip if already have a persistent loop for this task
      if (existingTaskIds.has(taskId)) continue

      // Check if there's an active logs directory with recent activity
      const logsDir = `${this.claudeDir}/ralph-logs-${taskId}`
      const logsCheck = await remoteExecService.execCommand(containerId, [
        'bash',
        '-c',
        `ls -1t ${logsDir}/iteration-*.log 2>/dev/null | head -1 || true`,
      ])

      if (logsCheck.success && logsCheck.output?.trim()) {
        // Has logs - this is an active fresh mode loop
        const latestLog = logsCheck.output.trim()
        const iterMatch = latestLog.match(/iteration-(\d+)\.log$/)
        const iteration = iterMatch ? parseInt(iterMatch[1], 10) : 0

        // Parse spec for additional info
        const spec = await this.parseSpecFile(containerId, specFile)

        loops.push({
          taskId,
          status: 'running',
          iteration,
          maxIterations: spec?.maxIterations || 50,
          completionPromise: spec?.completionPromise || null,
          mode: spec?.mode || 'yolo',
          startedAt: new Date(),
          stateFile: null,
          projectPath: spec?.projectPath || '',
          progressFile: `${this.claudeDir}/ralph-progress-${taskId}.md`,
          steeringFile: `${this.claudeDir}/ralph-steering-${taskId}.md`,
          steeringStatus: 'none',
          loopType: 'fresh',
          spec: spec || undefined,
        })
      }
    }

    return loops
  }

  /**
   * Parse a persistent loop state file
   */
  private async parseLoopStateFile(
    containerId: string,
    filepath: string
  ): Promise<RalphLoop | null> {
    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `cat '${filepath}'`,
    ])

    if (!result.success || !result.output) {
      return null
    }

    try {
      const content = result.output
      const frontmatter = this.parseFrontmatter(content)

      // Extract taskId from filename
      const match = filepath.match(/ralph-loop-([^/]+)\.local\.md$/)
      if (!match) return null

      const taskId = match[1]

      // Get spec if available
      const specFile = `${this.claudeDir}/ralph-spec-${taskId}.md`
      const spec = await this.parseSpecFile(containerId, specFile)

      // Check steering status
      const steeringStatus = await this.getSteeringStatus(containerId, taskId)

      const status = (frontmatter.status || 'running') as RalphLoop['status']
      const mode = (frontmatter.mode || spec?.mode || 'yolo') as RalphLoop['mode']
      return {
        taskId,
        status,
        iteration: parseInt(frontmatter.iteration, 10) || 0,
        maxIterations: parseInt(frontmatter.max_iterations, 10) || spec?.maxIterations || 50,
        completionPromise: frontmatter.completion_promise || spec?.completionPromise || null,
        mode,
        startedAt: frontmatter.started_at ? new Date(frontmatter.started_at) : new Date(),
        stateFile: filepath,
        projectPath: frontmatter.project_path || '',
        progressFile: `${this.claudeDir}/ralph-progress-${taskId}.md`,
        steeringFile: `${this.claudeDir}/ralph-steering-${taskId}.md`,
        steeringStatus,
        loopType: 'persistent',
        spec: spec || undefined,
      }
    } catch (error) {
      console.error(`Failed to parse loop state file ${filepath}:`, error)
      return null
    }
  }

  /**
   * Parse a spec file
   */
  private async parseSpecFile(
    containerId: string,
    filepath: string
  ): Promise<RalphSpec | null> {
    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `cat '${filepath}' 2>/dev/null || true`,
    ])

    if (!result.success || !result.output?.trim()) {
      return null
    }

    try {
      const content = result.output
      const frontmatter = this.parseFrontmatter(content)
      const body = this.extractBody(content)

      // Extract taskId from filename
      const match = filepath.match(/ralph-spec-([^/]+)\.md$/)
      if (!match) return null

      const taskId = match[1]

      return {
        taskId,
        maxIterations: parseInt(frontmatter.max_iterations, 10) || 50,
        completionPromise: frontmatter.completion_promise || null,
        mode: (frontmatter.mode as 'yolo' | 'review') || 'yolo',
        taskContent: body,
        taskSummary: body.split('\n\n')[0]?.substring(0, 200) || '',
        specFile: filepath,
        projectPath: frontmatter.project_path || '',
      }
    } catch (error) {
      console.error(`Failed to parse spec file ${filepath}:`, error)
      return null
    }
  }

  /**
   * Get a specific loop by taskId
   */
  async getLoop(containerId: string, taskId: string): Promise<RalphLoop | null> {
    const loops = await this.listLoops(containerId)
    return loops.find((l) => l.taskId === taskId) || null
  }

  /**
   * Get steering status for a task
   */
  private async getSteeringStatus(
    containerId: string,
    taskId: string
  ): Promise<'none' | 'pending' | 'answered'> {
    const steeringFile = `${this.claudeDir}/ralph-steering-${taskId}.md`

    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `cat '${steeringFile}' 2>/dev/null || true`,
    ])

    if (!result.success || !result.output?.trim()) {
      return 'none'
    }

    const frontmatter = this.parseFrontmatter(result.output)
    return (frontmatter.status as 'pending' | 'answered') || 'none'
  }

  /**
   * Get steering question for a task
   */
  async getSteering(containerId: string, taskId: string): Promise<SteeringQuestion | null> {
    const steeringFile = `${this.claudeDir}/ralph-steering-${taskId}.md`

    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `cat '${steeringFile}' 2>/dev/null || true`,
    ])

    if (!result.success || !result.output?.trim()) {
      return null
    }

    try {
      const content = result.output
      const frontmatter = this.parseFrontmatter(content)

      // Parse markdown sections
      const questionMatch = content.match(/## Question\s*\n([\s\S]*?)(?=\n## |$)/)
      const contextMatch = content.match(/## Context\s*\n([\s\S]*?)(?=\n## |$)/)
      const optionsMatch = content.match(/## Options\s*\n([\s\S]*?)(?=\n## |$)/)
      const responseMatch = content.match(/## Response\s*\n([\s\S]*?)(?=\n## |$)/)

      // Parse options list
      let options: string[] | undefined
      if (optionsMatch) {
        options = optionsMatch[1]
          .split('\n')
          .filter((line) => /^\d+\./.test(line.trim()))
          .map((line) => line.replace(/^\d+\.\s*/, '').trim())
      }

      return {
        taskId,
        status: (frontmatter.status as 'pending' | 'answered') || 'pending',
        iteration: parseInt(frontmatter.iteration, 10) || 0,
        timestamp: frontmatter.timestamp || new Date().toISOString(),
        question: questionMatch?.[1]?.trim() || '',
        context: contextMatch?.[1]?.trim(),
        options,
        response: responseMatch?.[1]?.trim(),
      }
    } catch (error) {
      console.error(`Failed to parse steering file for ${taskId}:`, error)
      return null
    }
  }

  /**
   * Answer a steering question
   */
  async answerSteering(
    containerId: string,
    taskId: string,
    response: string
  ): Promise<boolean> {
    const steeringFile = `${this.claudeDir}/ralph-steering-${taskId}.md`

    // Read current file
    const readResult = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `cat '${steeringFile}' 2>/dev/null || true`,
    ])

    if (!readResult.success || !readResult.output?.trim()) {
      return false
    }

    // Update status and response
    let content = readResult.output

    // Update frontmatter status
    content = content.replace(/^status:\s*pending/m, 'status: answered')

    // Update response section
    content = content.replace(
      /## Response\s*\n[\s\S]*?(?=\n## |$)/,
      `## Response\n${response}\n`
    )

    // If no response section, append it
    if (!content.includes('## Response')) {
      content += `\n## Response\n${response}\n`
    }

    // Write back
    const escapedContent = content.replace(/'/g, "'\\''")
    const writeResult = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `cat > '${steeringFile}' << 'EOFSTEERING'\n${content}\nEOFSTEERING`,
    ])

    return writeResult.success
  }

  /**
   * Get progress for a task
   */
  async getProgress(containerId: string, taskId: string): Promise<RalphProgress | null> {
    const progressFile = `${this.claudeDir}/ralph-progress-${taskId}.md`

    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `cat '${progressFile}' 2>/dev/null || true`,
    ])

    if (!result.success || !result.output?.trim()) {
      return null
    }

    const content = result.output
    const firstParagraph = content.split('\n\n')[0] || ''

    return {
      taskId,
      content,
      summary: firstParagraph.substring(0, 200),
      lastUpdate: new Date(),
    }
  }

  /**
   * Get summary for a completed task
   */
  async getSummary(containerId: string, taskId: string): Promise<RalphSummary | null> {
    const summaryFile = `${this.claudeDir}/ralph-summary-${taskId}.md`

    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `cat '${summaryFile}' 2>/dev/null || true`,
    ])

    if (!result.success || !result.output?.trim()) {
      return null
    }

    const content = result.output
    const frontmatter = this.parseFrontmatter(content)

    return {
      taskId,
      content: this.extractBody(content),
      outcome: (frontmatter.outcome as 'success' | 'failure' | 'partial') || 'success',
      completedAt: frontmatter.completed_at ? new Date(frontmatter.completed_at) : new Date(),
    }
  }

  /**
   * Parse YAML frontmatter from markdown
   */
  private parseFrontmatter(content: string): Record<string, string> {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!match) return {}

    const frontmatter: Record<string, string> = {}
    const lines = match[1].split('\n')

    for (const line of lines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim()
        const value = line.substring(colonIndex + 1).trim()
        frontmatter[key] = value
      }
    }

    return frontmatter
  }

  /**
   * Extract body content after frontmatter
   */
  private extractBody(content: string): string {
    const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)/)
    return match ? match[1].trim() : content.trim()
  }
}

export const remoteRalphService = new RemoteRalphService()
