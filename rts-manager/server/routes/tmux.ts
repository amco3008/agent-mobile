import { Router } from 'express'
import { tmuxService } from '../services'

const router = Router()

// GET /api/tmux/sessions - List all sessions
router.get('/sessions', async (_req, res) => {
  try {
    const sessions = await tmuxService.listSessions()
    res.json(sessions)
  } catch (error) {
    console.error('Error listing sessions:', error)
    res.status(500).json({ error: 'Failed to list tmux sessions' })
  }
})

// GET /api/tmux/sessions/:id - Get session details
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await tmuxService.getSession(req.params.id)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    res.json(session)
  } catch (error) {
    console.error('Error getting session:', error)
    res.status(500).json({ error: 'Failed to get session' })
  }
})

// GET /api/tmux/sessions/:id/capture - Capture pane content
router.get('/sessions/:id/capture', async (req, res) => {
  try {
    const { paneId } = req.query
    const content = await tmuxService.capturePane(
      req.params.id,
      paneId as string | undefined
    )
    res.json({ content })
  } catch (error) {
    console.error('Error capturing pane:', error)
    res.status(500).json({ error: 'Failed to capture pane' })
  }
})

// POST /api/tmux/sessions/:id/keys - Send keys to pane
router.post('/sessions/:id/keys', async (req, res) => {
  try {
    const { paneId, keys } = req.body

    // Validate required fields
    if (typeof paneId !== 'string' || !paneId.trim()) {
      return res.status(400).json({ error: 'paneId is required and must be a non-empty string' })
    }
    if (typeof keys !== 'string') {
      return res.status(400).json({ error: 'keys is required and must be a string' })
    }
    // Limit keys length to prevent abuse
    if (keys.length > 10000) {
      return res.status(400).json({ error: 'keys exceeds maximum length of 10000 characters' })
    }

    await tmuxService.sendKeys(req.params.id, paneId.trim(), keys)
    res.json({ success: true })
  } catch (error) {
    console.error('Error sending keys:', error)
    res.status(500).json({ error: 'Failed to send keys' })
  }
})

// POST /api/tmux/sessions - Create new session
router.post('/sessions', async (req, res) => {
  try {
    const { name } = req.body

    // Validate session name if provided
    if (name !== undefined) {
      if (typeof name !== 'string') {
        return res.status(400).json({ error: 'name must be a string' })
      }
      // Session names should be alphanumeric with underscores/hyphens
      if (name.length > 0 && !/^[a-zA-Z0-9_-]+$/.test(name)) {
        return res.status(400).json({ error: 'name must contain only alphanumeric characters, underscores, and hyphens' })
      }
      if (name.length > 100) {
        return res.status(400).json({ error: 'name exceeds maximum length of 100 characters' })
      }
    }

    const session = await tmuxService.createSession(name)
    res.json(session)
  } catch (error) {
    console.error('Error creating session:', error)
    res.status(500).json({ error: 'Failed to create session' })
  }
})

// DELETE /api/tmux/sessions/:id - Kill session
router.delete('/sessions/:id', async (req, res) => {
  try {
    await tmuxService.killSession(req.params.id)
    res.json({ success: true })
  } catch (error) {
    console.error('Error killing session:', error)
    res.status(500).json({ error: 'Failed to kill session' })
  }
})

export { router as tmuxRouter }
