import { Router } from 'express'
import { containerManager } from '../services/ContainerManager'

const router = Router()

// GET /api/containers - List all agent-mobile containers
router.get('/', async (_req, res) => {
  try {
    const containers = await containerManager.listContainers()
    res.json(containers)
  } catch (error) {
    console.error('Error listing containers:', error)
    res.status(500).json({ error: 'Failed to list containers' })
  }
})

// GET /api/containers/ping - Test Docker connection
router.get('/ping', async (_req, res) => {
  try {
    const ok = await containerManager.ping()
    res.json({ ok })
  } catch (error) {
    console.error('Error pinging Docker:', error)
    res.status(500).json({ error: 'Failed to ping Docker', ok: false })
  }
})

// GET /api/containers/:id - Get single container
router.get('/:id', async (req, res) => {
  try {
    const container = await containerManager.getContainer(req.params.id)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    res.json(container)
  } catch (error) {
    console.error('Error getting container:', error)
    res.status(500).json({ error: 'Failed to get container' })
  }
})

// GET /api/containers/:id/stats - Get container stats
router.get('/:id/stats', async (req, res) => {
  try {
    const stats = await containerManager.getContainerStats(req.params.id)
    if (!stats) {
      return res.status(404).json({ error: 'Container not found or stats unavailable' })
    }
    res.json(stats)
  } catch (error) {
    console.error('Error getting container stats:', error)
    res.status(500).json({ error: 'Failed to get container stats' })
  }
})

// POST /api/containers/:id/start - Start container
router.post('/:id/start', async (req, res) => {
  try {
    await containerManager.startContainer(req.params.id)
    res.json({ success: true })
  } catch (error) {
    console.error('Error starting container:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to start container', message })
  }
})

// POST /api/containers/:id/stop - Stop container
router.post('/:id/stop', async (req, res) => {
  try {
    await containerManager.stopContainer(req.params.id)
    res.json({ success: true })
  } catch (error) {
    console.error('Error stopping container:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to stop container', message })
  }
})

// POST /api/containers/:id/restart - Restart container
router.post('/:id/restart', async (req, res) => {
  try {
    await containerManager.restartContainer(req.params.id)
    res.json({ success: true })
  } catch (error) {
    console.error('Error restarting container:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to restart container', message })
  }
})

export default router
