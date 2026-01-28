import { Router } from 'express'
import { ralphWatcher } from '../services'

const router = Router()

// Validation regex for taskId - alphanumeric, underscore, hyphen only
// Prevents path traversal attacks
const TASK_ID_REGEX = /^[a-zA-Z0-9_-]+$/

function isValidTaskId(taskId: string): boolean {
  return TASK_ID_REGEX.test(taskId) && taskId.length > 0 && taskId.length <= 100
}

// GET /api/ralph/loops - List all active loops
router.get('/loops', async (_req, res) => {
  try {
    const loops = await ralphWatcher.listLoops()
    res.json(loops)
  } catch (error) {
    console.error('Error listing loops:', error)
    res.status(500).json({ error: 'Failed to list Ralph loops' })
  }
})

// GET /api/ralph/loops/:taskId - Get loop details
router.get('/loops/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    if (!isValidTaskId(taskId)) {
      return res.status(400).json({ error: 'Invalid taskId format' })
    }

    const loop = await ralphWatcher.getLoop(taskId)
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' })
    }
    res.json(loop)
  } catch (error) {
    console.error('Error getting loop:', error)
    res.status(500).json({ error: 'Failed to get loop' })
  }
})

// GET /api/ralph/loops/:taskId/progress - Get progress file content
router.get('/loops/:taskId/progress', async (req, res) => {
  try {
    const { taskId } = req.params
    if (!isValidTaskId(taskId)) {
      return res.status(400).json({ error: 'Invalid taskId format' })
    }

    const progress = await ralphWatcher.getProgress(taskId)
    res.json({ progress })
  } catch (error) {
    console.error('Error getting progress:', error)
    res.status(500).json({ error: 'Failed to get progress' })
  }
})

// POST /api/ralph/loops/:taskId/steer - Answer steering question
router.post('/loops/:taskId/steer', async (req, res) => {
  try {
    const { taskId } = req.params
    if (!isValidTaskId(taskId)) {
      return res.status(400).json({ error: 'Invalid taskId format' })
    }

    const { response } = req.body

    // Validate response field
    if (typeof response !== 'string') {
      return res.status(400).json({ error: 'response is required and must be a string' })
    }
    if (!response.trim()) {
      return res.status(400).json({ error: 'response cannot be empty' })
    }
    // Limit response length to prevent abuse
    if (response.length > 50000) {
      return res.status(400).json({ error: 'response exceeds maximum length of 50000 characters' })
    }

    // Sanitize response - remove null bytes and control characters except newlines/tabs
    const sanitizedResponse = response
      .replace(/\0/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

    await ralphWatcher.answerSteering(taskId, sanitizedResponse)
    res.json({ success: true })
  } catch (error) {
    console.error('Error steering loop:', error)
    res.status(500).json({ error: 'Failed to steer loop' })
  }
})

// DELETE /api/ralph/loops/:taskId - Cancel loop
router.delete('/loops/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    if (!isValidTaskId(taskId)) {
      return res.status(400).json({ error: 'Invalid taskId format' })
    }

    await ralphWatcher.cancelLoop(taskId)
    res.json({ success: true })
  } catch (error) {
    console.error('Error cancelling loop:', error)
    res.status(500).json({ error: 'Failed to cancel loop' })
  }
})

export { router as ralphRouter }
