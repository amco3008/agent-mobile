import { memo } from 'react'
import { motion } from 'framer-motion'
import { useSocketStore } from '../../stores/socketStore'

interface ProgressDisplayProps {
  taskId: string
}

export const ProgressDisplay = memo(function ProgressDisplay({ taskId }: ProgressDisplayProps) {
  const progress = useSocketStore((state) => state.ralphProgress.get(taskId))

  if (!progress) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="factory-panel p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-signal-green text-sm">&#9658;</span>
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Progress
        </h4>
        {progress.lastUpdate && (
          <span className="text-[10px] text-gray-500 ml-auto">
            {formatTime(progress.lastUpdate)}
          </span>
        )}
      </div>

      {/* Summary line */}
      {progress.summary && (
        <p className="text-xs text-gray-300 mb-2 line-clamp-2">
          {progress.summary}
        </p>
      )}

      {/* Full content (collapsible) */}
      <details className="text-xs">
        <summary className="text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
          Show full progress
        </summary>
        <div className="mt-2 p-2 bg-factory-bg/50 rounded max-h-48 overflow-y-auto">
          <pre className="text-gray-400 whitespace-pre-wrap font-mono text-[11px]">
            {progress.content}
          </pre>
        </div>
      </details>
    </motion.div>
  )
})

function formatTime(date: Date): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
