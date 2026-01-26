import { Request, Response, NextFunction } from 'express'

/**
 * Helper to safely extract a string param from Express params
 * (Express 5 params can be string | string[])
 */
export function getStringParam(param: string | string[] | undefined): string | undefined {
  if (Array.isArray(param)) return param[0]
  return param
}

/**
 * Docker container ID format: 12-64 hex characters
 */
const containerIdRegex = /^[a-f0-9]{12,64}$/i

/**
 * Socket validation helper - validates tmux subscribe/unsubscribe params
 */
export function validateSocketTmuxParams(
  params: { sessionId?: string; paneId?: string }
): { valid: boolean; error?: string } {
  const { sessionId, paneId } = params

  if (!sessionId || typeof sessionId !== 'string') {
    return { valid: false, error: 'sessionId is required and must be a string' }
  }
  if (!paneId || typeof paneId !== 'string') {
    return { valid: false, error: 'paneId is required and must be a string' }
  }

  const tmuxIdRegex = /^[a-zA-Z0-9_\-:.@]+$/
  if (!tmuxIdRegex.test(sessionId)) {
    return { valid: false, error: 'Invalid sessionId format' }
  }
  if (!tmuxIdRegex.test(paneId)) {
    return { valid: false, error: 'Invalid paneId format' }
  }

  // Limit ID lengths to prevent abuse
  if (sessionId.length > 100 || paneId.length > 100) {
    return { valid: false, error: 'ID too long' }
  }

  return { valid: true }
}

/**
 * Socket validation helper - validates tmux input data
 */
export function validateSocketInputData(
  data: unknown
): { valid: boolean; error?: string } {
  if (typeof data !== 'string') {
    return { valid: false, error: 'data must be a string' }
  }
  // Limit input size to 4KB
  if (data.length > 4096) {
    return { valid: false, error: 'Input data too large (max 4KB)' }
  }
  return { valid: true }
}

/**
 * Validate container ID parameter
 * Supports both :id and :containerId param names
 */
export function validateContainerId(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const id = getStringParam(req.params.id) || getStringParam(req.params.containerId)
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
  const id = getStringParam(req.params.id) || getStringParam(req.params.sessionId)
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
  const id = getStringParam(req.params.taskId) || getStringParam(req.params.id)
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
