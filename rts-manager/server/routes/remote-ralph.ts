import { Router } from 'express'
import { remoteRalphService } from '../services/RemoteRalphService'
import { containerManager } from '../services/ContainerManager'
import { validateContainerId } from '../middleware'

const router = Router()

/**
 * Remote Ralph routes - access Ralph loops in other containers
 * All routes require containerId parameter
 */

// GET /api/containers/:containerId/ralph/loops - List loops in a container
router.get('/:containerId/ralph/loops', validateContainerId, async (req, res) => {
  try {
    const { containerId } = req.params

    // Verify container exists and is running
    const container = await containerManager.getContainer(containerId)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.status(400).json({ error: `Container is ${container.status}, not running` })
    }

    const loops = await remoteRalphService.listLoops(containerId)
    res.json(loops)
  } catch (error) {
    console.error('Error listing remote loops:', error)
    res.status(500).json({ error: 'Failed to list Ralph loops in container' })
  }
})

// GET /api/containers/:containerId/ralph/loops/:taskId - Get loop details
router.get('/:containerId/ralph/loops/:taskId', validateContainerId, async (req, res) => {
  try {
    const { containerId, taskId } = req.params

    // Verify container exists and is running
    const container = await containerManager.getContainer(containerId)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.status(400).json({ error: `Container is ${container.status}, not running` })
    }

    const loop = await remoteRalphService.getLoop(containerId, taskId)
    if (!loop) {
      return res.status(404).json({ error: 'Loop not found' })
    }
    res.json(loop)
  } catch (error) {
    console.error('Error getting remote loop:', error)
    res.status(500).json({ error: 'Failed to get loop' })
  }
})

// GET /api/containers/:containerId/ralph/loops/:taskId/progress - Get progress
router.get('/:containerId/ralph/loops/:taskId/progress', validateContainerId, async (req, res) => {
  try {
    const { containerId, taskId } = req.params

    // Verify container exists and is running
    const container = await containerManager.getContainer(containerId)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.status(400).json({ error: `Container is ${container.status}, not running` })
    }

    const progress = await remoteRalphService.getProgress(containerId, taskId)
    res.json({ progress })
  } catch (error) {
    console.error('Error getting remote progress:', error)
    res.status(500).json({ error: 'Failed to get progress' })
  }
})

// GET /api/containers/:containerId/ralph/loops/:taskId/steering - Get steering question
router.get('/:containerId/ralph/loops/:taskId/steering', validateContainerId, async (req, res) => {
  try {
    const { containerId, taskId } = req.params

    // Verify container exists and is running
    const container = await containerManager.getContainer(containerId)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.status(400).json({ error: `Container is ${container.status}, not running` })
    }

    const steering = await remoteRalphService.getSteering(containerId, taskId)
    res.json({ steering })
  } catch (error) {
    console.error('Error getting remote steering:', error)
    res.status(500).json({ error: 'Failed to get steering' })
  }
})

// POST /api/containers/:containerId/ralph/loops/:taskId/steer - Answer steering question
router.post('/:containerId/ralph/loops/:taskId/steer', validateContainerId, async (req, res) => {
  try {
    const { containerId, taskId } = req.params
    const { response } = req.body

    // Validate response field
    if (typeof response !== 'string') {
      return res.status(400).json({ error: 'response is required and must be a string' })
    }
    if (!response.trim()) {
      return res.status(400).json({ error: 'response cannot be empty' })
    }
    if (response.length > 50000) {
      return res.status(400).json({ error: 'response exceeds maximum length of 50000 characters' })
    }

    // Verify container exists and is running
    const container = await containerManager.getContainer(containerId)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.status(400).json({ error: `Container is ${container.status}, not running` })
    }

    // Sanitize response
    const sanitizedResponse = response
      .replace(/\0/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

    const success = await remoteRalphService.answerSteering(containerId, taskId, sanitizedResponse)
    if (!success) {
      return res.status(500).json({ error: 'Failed to answer steering question' })
    }
    res.json({ success: true })
  } catch (error) {
    console.error('Error answering remote steering:', error)
    res.status(500).json({ error: 'Failed to steer loop' })
  }
})

// GET /api/containers/:containerId/ralph/loops/:taskId/summary - Get completion summary
router.get('/:containerId/ralph/loops/:taskId/summary', validateContainerId, async (req, res) => {
  try {
    const { containerId, taskId } = req.params

    // Verify container exists and is running
    const container = await containerManager.getContainer(containerId)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.status(400).json({ error: `Container is ${container.status}, not running` })
    }

    const summary = await remoteRalphService.getSummary(containerId, taskId)
    res.json({ summary })
  } catch (error) {
    console.error('Error getting remote summary:', error)
    res.status(500).json({ error: 'Failed to get summary' })
  }
})

export default router
