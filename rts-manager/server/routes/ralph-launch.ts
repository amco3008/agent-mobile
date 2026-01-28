import { Router } from 'express'
import { remoteExecService } from '../services/RemoteExecService'
import { containerManager } from '../services/ContainerManager'
import { validateContainerId } from '../middleware'

const router = Router()

/**
 * POST /api/ralph/launch - Start interactive Claude session in a container
 *
 * Creates a new tmux session running `claude` for interactive ralph-invoke flow
 */
router.post('/launch', async (req, res) => {
  const { containerId, workingDir, command = 'claude' } = req.body

  // Validate required fields
  if (!containerId) {
    return res.status(400).json({
      error: 'Missing required field',
      message: 'containerId is required',
    })
  }

  // Validate container ID format
  const containerIdRegex = /^[a-f0-9]{12,64}$/i
  if (!containerIdRegex.test(containerId)) {
    return res.status(400).json({
      error: 'Invalid container ID format',
      message: 'Container ID must be 12-64 hexadecimal characters',
    })
  }

  // Validate workingDir for path traversal attacks
  if (workingDir) {
    // Reject paths with parent directory references or suspicious patterns
    if (
      workingDir.includes('..') ||
      workingDir.includes('//') ||
      workingDir.includes('\x00') ||
      /[;&|`$]/.test(workingDir)
    ) {
      return res.status(400).json({
        error: 'Invalid working directory',
        message: 'Working directory contains invalid characters or path traversal patterns',
      })
    }
  }

  // Verify container exists and is running
  const container = await containerManager.getContainer(containerId)
  if (!container) {
    return res.status(404).json({
      error: 'Container not found',
      message: 'The specified container was not found or is not an agent-mobile container',
    })
  }

  if (container.status !== 'running') {
    return res.status(400).json({
      error: 'Container not running',
      message: `Container is ${container.status}. Start the container first.`,
    })
  }

  // Generate unique session name
  const sessionName = `ralph-${Date.now()}`

  // Validate command (only allow safe commands)
  const allowedCommands = ['claude', 'claude /ralph-invoke', 'bash']
  const sanitizedCommand = allowedCommands.includes(command) ? command : 'claude'

  // Create tmux session
  const result = await remoteExecService.createTmuxSession(
    containerId,
    sessionName,
    sanitizedCommand,
    workingDir
  )

  if (!result.success) {
    return res.status(500).json({
      error: 'Failed to create session',
      message: result.error,
    })
  }

  res.json({
    success: true,
    sessionName,
    containerId,
    containerName: container.name,
    command: sanitizedCommand,
    workingDir: workingDir || null,
    message: 'Claude session started. Connect via terminal.',
  })
})

/**
 * GET /api/ralph/sessions/:containerId - List ralph sessions in a container
 */
router.get('/sessions/:containerId', async (req, res) => {
  const { containerId } = req.params

  // Validate container ID format
  const containerIdRegex = /^[a-f0-9]{12,64}$/i
  if (!containerIdRegex.test(containerId)) {
    return res.status(400).json({
      error: 'Invalid container ID format',
    })
  }

  const sessions = await remoteExecService.listTmuxSessions(containerId)

  // Filter to only ralph-* sessions
  const ralphSessions = sessions.filter((s) => s.startsWith('ralph-'))

  res.json({
    containerId,
    sessions: ralphSessions,
    count: ralphSessions.length,
  })
})

/**
 * DELETE /api/ralph/sessions/:containerId/:sessionName - Kill a ralph session
 */
router.delete('/sessions/:containerId/:sessionName', async (req, res) => {
  const { containerId, sessionName } = req.params

  // Validate container ID format
  const containerIdRegex = /^[a-f0-9]{12,64}$/i
  if (!containerIdRegex.test(containerId)) {
    return res.status(400).json({
      error: 'Invalid container ID format',
    })
  }

  // Validate session name (only allow ralph-* sessions for safety)
  if (!sessionName.startsWith('ralph-')) {
    return res.status(400).json({
      error: 'Invalid session name',
      message: 'Can only kill ralph-* sessions',
    })
  }

  const result = await remoteExecService.killTmuxSession(containerId, sessionName)

  if (!result.success) {
    return res.status(500).json({
      error: 'Failed to kill session',
      message: result.error,
    })
  }

  res.json({
    success: true,
    message: `Session '${sessionName}' killed`,
  })
})

/**
 * POST /api/ralph/auto-launch - Auto-launch ralph for an existing spec
 *
 * Used when RalphWatcher detects a new spec file and user wants to launch
 */
router.post('/auto-launch', async (req, res) => {
  const { containerId, taskId } = req.body

  if (!containerId || !taskId) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'containerId and taskId are required',
    })
  }

  // Validate container ID format
  const containerIdRegex = /^[a-f0-9]{12,64}$/i
  if (!containerIdRegex.test(containerId)) {
    return res.status(400).json({
      error: 'Invalid container ID format',
    })
  }

  // Validate taskId format (alphanumeric with dashes/underscores)
  const taskIdRegex = /^[a-zA-Z0-9_-]+$/
  if (!taskIdRegex.test(taskId)) {
    return res.status(400).json({
      error: 'Invalid task ID format',
      message: 'Task ID must be alphanumeric with dashes/underscores',
    })
  }

  // Verify container exists and is running
  const container = await containerManager.getContainer(containerId)
  if (!container) {
    return res.status(404).json({ error: 'Container not found' })
  }

  if (container.status !== 'running') {
    return res.status(400).json({
      error: 'Container not running',
      message: `Container is ${container.status}`,
    })
  }

  // Create session name based on taskId
  const sessionName = `ralph-${taskId}`

  // Check if session already exists
  const existingCheck = await remoteExecService.checkTmuxSession(containerId, sessionName)
  if (existingCheck.exists) {
    return res.status(409).json({
      error: 'Session already exists',
      message: `Session '${sessionName}' is already running`,
    })
  }

  // Launch ralph <taskId>
  const result = await remoteExecService.createTmuxSession(
    containerId,
    sessionName,
    `ralph ${taskId}`,
    undefined // ralph uses the spec file's working dir
  )

  if (!result.success) {
    return res.status(500).json({
      error: 'Failed to launch ralph',
      message: result.error,
    })
  }

  res.json({
    success: true,
    sessionName,
    taskId,
    containerId,
    message: `Ralph loop '${taskId}' started`,
  })
})

export default router
