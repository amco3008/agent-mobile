import { readFile, readdir, writeFile } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import matter from 'gray-matter'
import type { RalphLoop } from '../../src/types'

// Paths to search for Ralph state files
const SEARCH_PATHS = [
  process.env.HOME || '/home/agent',
  join(process.env.HOME || '/home/agent', 'projects'),
]

export class RalphWatcher {
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
