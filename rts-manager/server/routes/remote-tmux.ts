import { Router } from 'express'
import { remoteTmuxService } from '../services/RemoteTmuxService'
import { containerManager } from '../services/ContainerManager'
import { validateContainerId, validateTmuxSessionId, getStringParam } from '../middleware'

const router = Router()

/**
 * Remote tmux routes - access tmux sessions in other containers
 * All routes require containerId parameter
 */

// GET /api/containers/:containerId/tmux/sessions - List sessions in a container
router.get('/:containerId/tmux/sessions', validateContainerId, async (req, res) => {
  const containerId = getStringParam(req.params.containerId) as string
  try {
    // Verify container exists and is running
    const container = await containerManager.getContainer(containerId)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.status(400).json({ error: `Container is ${container.status}, not running` })
    }

    const sessions = await remoteTmuxService.listSessions(containerId)
    res.json(sessions)
  } catch (error) {
    console.error('Error listing remote sessions:', error)
    res.status(500).json({ error: 'Failed to list tmux sessions in container' })
  }
})

// GET /api/containers/:containerId/tmux/sessions/:sessionId - Get session details
router.get('/:containerId/tmux/sessions/:sessionId', validateContainerId, validateTmuxSessionId, async (req, res) => {
  const containerId = getStringParam(req.params.containerId) as string
  const sessionId = getStringParam(req.params.sessionId) as string
  try {
    // Verify container exists and is running
    const container = await containerManager.getContainer(containerId)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.status(400).json({ error: `Container is ${container.status}, not running` })
    }

    const session = await remoteTmuxService.getSession(containerId, sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    res.json(session)
  } catch (error) {
    console.error('Error getting remote session:', error)
    res.status(500).json({ error: 'Failed to get session' })
  }
})

// GET /api/containers/:containerId/tmux/sessions/:sessionId/capture - Capture pane content
router.get('/:containerId/tmux/sessions/:sessionId/capture', validateContainerId, validateTmuxSessionId, async (req, res) => {
  const containerId = getStringParam(req.params.containerId) as string
  const sessionId = getStringParam(req.params.sessionId) as string
  const { paneId } = req.query
  try {
    // Verify container exists and is running
    const container = await containerManager.getContainer(containerId)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.status(400).json({ error: `Container is ${container.status}, not running` })
    }

    const content = await remoteTmuxService.capturePane(
      containerId,
      sessionId,
      (paneId as string) || '0'
    )
    res.json({ content })
  } catch (error) {
    console.error('Error capturing remote pane:', error)
    res.status(500).json({ error: 'Failed to capture pane' })
  }
})

// POST /api/containers/:containerId/tmux/sessions/:sessionId/keys - Send keys to pane
router.post('/:containerId/tmux/sessions/:sessionId/keys', validateContainerId, validateTmuxSessionId, async (req, res) => {
  const containerId = getStringParam(req.params.containerId) as string
  const sessionId = getStringParam(req.params.sessionId) as string
  const { paneId, keys } = req.body
  try {

    // Validate required fields
    if (typeof paneId !== 'string' || !paneId.trim()) {
      return res.status(400).json({ error: 'paneId is required and must be a non-empty string' })
    }
    if (typeof keys !== 'string') {
      return res.status(400).json({ error: 'keys is required and must be a string' })
    }
    if (keys.length > 10000) {
      return res.status(400).json({ error: 'keys exceeds maximum length of 10000 characters' })
    }

    // Verify container exists and is running
    const container = await containerManager.getContainer(containerId)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.status(400).json({ error: `Container is ${container.status}, not running` })
    }

    const success = await remoteTmuxService.sendKeys(containerId, sessionId, paneId.trim(), keys)
    if (!success) {
      return res.status(500).json({ error: 'Failed to send keys' })
    }
    res.json({ success: true })
  } catch (error) {
    console.error('Error sending keys to remote pane:', error)
    res.status(500).json({ error: 'Failed to send keys' })
  }
})

export default router
