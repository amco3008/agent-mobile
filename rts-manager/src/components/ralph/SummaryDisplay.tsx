import { memo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSocketStore } from '../../stores/socketStore'

interface SummaryDisplayProps {
  taskId: string
  onDismiss?: () => void
}

export const SummaryDisplay = memo(function SummaryDisplay({ taskId, onDismiss }: SummaryDisplayProps) {
  const [dismissed, setDismissed] = useState(false)
  const summary = useSocketStore((state) => state.ralphSummaries.get(taskId))

  if (!summary || dismissed) {
    return null
  }

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  const outcomeColors = {
    success: 'text-signal-green border-signal-green/50',
    failure: 'text-signal-red border-signal-red/50',
    partial: 'text-signal-yellow border-signal-yellow/50',
    unknown: 'text-gray-400 border-factory-border',
  }

  const outcomeIcons = {
    success: '&#10003;',
    failure: '&#10007;',
    partial: '&#9888;',
    unknown: '?',
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`factory-panel p-4 ${outcomeColors[summary.outcome]}`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`text-lg ${outcomeColors[summary.outcome].split(' ')[0]}`}
              dangerouslySetInnerHTML={{ __html: outcomeIcons[summary.outcome] }}
            />
            <h4 className="text-sm font-bold">
              Loop {summary.outcome === 'success' ? 'Completed' : summary.outcome === 'failure' ? 'Failed' : 'Finished'}
            </h4>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-gray-500 hover:text-gray-300 text-xs"
            aria-label="Dismiss summary"
          >
            &#10005;
          </button>
        </div>

        {summary.completedAt && (
          <p className="text-[10px] text-gray-500 mb-2">
            Completed at {formatDateTime(summary.completedAt)}
          </p>
        )}

        {/* Summary content */}
        <div className="text-xs text-gray-300 bg-factory-bg/50 rounded p-2 max-h-48 overflow-y-auto">
          <pre className="whitespace-pre-wrap font-mono">
            {summary.content}
          </pre>
        </div>
      </motion.div>
    </AnimatePresence>
  )
})

function formatDateTime(date: Date): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
