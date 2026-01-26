import { Request, Response, NextFunction } from 'express'

/**
 * Docker container ID format: 12-64 hex characters
 */
const containerIdRegex = /^[a-f0-9]{12,64}$/i

/**
 * Validate container ID parameter
 * Supports both :id and :containerId param names
 */
export function validateContainerId(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = req.params.id || req.params.containerId
  if (!id || !containerIdRegex.test(id)) {
    return res.status(400).json({
      error: 'Invalid container ID format',
      message: 'Container ID must be 12-64 hexadecimal characters',
    })
  }
  next()
}

/**
 * Tmux session/pane ID format: alphanumeric with some special chars
 */
const tmuxIdRegex = /^[a-zA-Z0-9_\-:.@]+$/

/**
 * Validate tmux session ID parameter
 */
export function validateTmuxSessionId(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = req.params.id || req.params.sessionId
  if (!id || !tmuxIdRegex.test(id)) {
    return res.status(400).json({
      error: 'Invalid session ID format',
      message: 'Session ID contains invalid characters',
    })
  }
  next()
}

/**
 * Validate Ralph task ID parameter
 * Max length 100 to prevent abuse
 */
const taskIdRegex = /^[a-zA-Z0-9_\-]+$/
const TASK_ID_MAX_LENGTH = 100

export function validateTaskId(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = req.params.taskId || req.params.id
  if (!id || !taskIdRegex.test(id)) {
    return res.status(400).json({
      error: 'Invalid task ID format',
      message: 'Task ID must be alphanumeric with dashes/underscores',
    })
  }
  if (id.length > TASK_ID_MAX_LENGTH) {
    return res.status(400).json({
      error: 'Task ID too long',
      message: `Task ID must be at most ${TASK_ID_MAX_LENGTH} characters`,
    })
  }
  next()
}
