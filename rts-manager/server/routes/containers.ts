import { Router } from 'express'
import { containerManager } from '../services/ContainerManager'
import { remoteExecService } from '../services/RemoteExecService'
import { validateContainerId } from '../middleware'

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
router.get('/:id', validateContainerId, async (req, res) => {
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
router.get('/:id/stats', validateContainerId, async (req, res) => {
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
router.post('/:id/start', validateContainerId, async (req, res) => {
  try {
    const result = await containerManager.startContainer(req.params.id)
    if (!result.success) {
      return res.status(500).json({ error: 'Failed to start container', message: result.error })
    }
    res.json({ success: true })
  } catch (error) {
    console.error('Error starting container:', error)
    res.status(500).json({ error: 'Failed to start container' })
  }
})

// POST /api/containers/:id/stop - Stop container
router.post('/:id/stop', validateContainerId, async (req, res) => {
  try {
    const result = await containerManager.stopContainer(req.params.id)
    if (!result.success) {
      return res.status(500).json({ error: 'Failed to stop container', message: result.error })
    }
    res.json({ success: true })
  } catch (error) {
    console.error('Error stopping container:', error)
    res.status(500).json({ error: 'Failed to stop container' })
  }
})

// POST /api/containers/:id/restart - Restart container
router.post('/:id/restart', validateContainerId, async (req, res) => {
  try {
    const result = await containerManager.restartContainer(req.params.id)
    if (!result.success) {
      return res.status(500).json({ error: 'Failed to restart container', message: result.error })
    }
    res.json({ success: true })
  } catch (error) {
    console.error('Error restarting container:', error)
    res.status(500).json({ error: 'Failed to restart container' })
  }
})

// GET /api/containers/:id/sessions - List tmux sessions in a container
router.get('/:id/sessions', validateContainerId, async (req, res) => {
  try {
    // Check if container is running first
    const container = await containerManager.getContainer(req.params.id)
    if (!container) {
      return res.status(404).json({ error: 'Container not found' })
    }
    if (container.status !== 'running') {
      return res.json({ sessions: [], message: 'Container is not running' })
    }

    // Get tmux session names from the container
    const sessionNames = await remoteExecService.listTmuxSessions(req.params.id)

    // Return simplified session info (names only for now)
    // Full session details would require more complex docker exec parsing
    const sessions = sessionNames.map((name, index) => ({
      id: `${req.params.id}:${name}`,
      name,
      containerId: req.params.id,
      containerName: container.name,
    }))

    res.json({ sessions })
  } catch (error) {
    console.error('Error listing container sessions:', error)
    res.status(500).json({ error: 'Failed to list sessions' })
  }
})

export default router
