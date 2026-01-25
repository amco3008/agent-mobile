import { motion } from 'framer-motion'
import { useDashboardStore } from '../../stores/dashboardStore'

export function ZoomControls() {
  const { zoomLevel, setZoomLevel } = useDashboardStore()

  const levels = [
    { level: 1 as const, label: 'Overview', icon: '🗺️' },
    { level: 2 as const, label: 'Session', icon: '📋' },
    { level: 3 as const, label: 'Terminal', icon: '💻' },
  ]

  return (
    <div className="flex items-center gap-1">
      {levels.map(({ level, label, icon }) => (
        <motion.button
          key={level}
          onClick={() => setZoomLevel(level)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            zoomLevel === level
              ? 'bg-signal-yellow/20 text-signal-yellow border border-signal-yellow/50'
              : 'bg-factory-bg text-gray-400 border border-factory-border hover:border-gray-500'
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          title={label}
        >
          <span className="mr-1">{icon}</span>
          {level}x
        </motion.button>
      ))}
    </div>
  )
}
