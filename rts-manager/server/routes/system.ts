import { Router } from 'express'
import { SystemMonitor } from '../services/SystemMonitor'

const router = Router()
const systemMonitor = new SystemMonitor()

// GET /api/system/stats - Get system statistics
router.get('/stats', async (_req, res) => {
  try {
    const stats = await systemMonitor.getStats()
    res.json(stats)
  } catch (error) {
    console.error('Error getting stats:', error)
    res.status(500).json({ error: 'Failed to get system stats' })
  }
})

// GET /api/system/processes - Get running processes
router.get('/processes', async (_req, res) => {
  try {
    const processes = await systemMonitor.getClaudeProcesses()
    res.json(processes)
  } catch (error) {
    console.error('Error getting processes:', error)
    res.status(500).json({ error: 'Failed to get processes' })
  }
})

export { router as systemRouter }
