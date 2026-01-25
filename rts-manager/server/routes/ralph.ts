import { Router } from 'express'
import { RalphWatcher } from '../services/RalphWatcher'

const router = Router()
const ralphWatcher = new RalphWatcher()

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
    const loop = await ralphWatcher.getLoop(req.params.taskId)
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
    const progress = await ralphWatcher.getProgress(req.params.taskId)
    res.json({ progress })
  } catch (error) {
    console.error('Error getting progress:', error)
    res.status(500).json({ error: 'Failed to get progress' })
  }
})

// POST /api/ralph/loops/:taskId/steer - Answer steering question
router.post('/loops/:taskId/steer', async (req, res) => {
  try {
    const { response } = req.body
    await ralphWatcher.answerSteering(req.params.taskId, response)
    res.json({ success: true })
  } catch (error) {
    console.error('Error steering loop:', error)
    res.status(500).json({ error: 'Failed to steer loop' })
  }
})

// DELETE /api/ralph/loops/:taskId - Cancel loop
router.delete('/loops/:taskId', async (req, res) => {
  try {
    await ralphWatcher.cancelLoop(req.params.taskId)
    res.json({ success: true })
  } catch (error) {
    console.error('Error cancelling loop:', error)
    res.status(500).json({ error: 'Failed to cancel loop' })
  }
})

export { router as ralphRouter }
