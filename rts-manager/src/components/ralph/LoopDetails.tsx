import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSocketStore } from '../../stores/socketStore'
import { ProgressDisplay } from './ProgressDisplay'
import { SummaryDisplay } from './SummaryDisplay'
import { SteeringPanel } from './SteeringPanel'
import { useEscapeKey, useFocusTrap } from '../../hooks/useModal'
import type { RalphLoop } from '../../types'

interface LoopDetailsProps {
  loop: RalphLoop
  onClose: () => void
}

export const LoopDetails = memo(function LoopDetails({ loop, onClose }: LoopDetailsProps) {
  const steering = useSocketStore((state) => state.ralphSteering.get(loop.taskId))
  const summary = useSocketStore((state) => state.ralphSummaries.get(loop.taskId))

  // Accessibility: Escape key and focus trap
  useEscapeKey(onClose, true) // Always open when rendered
  const { containerRef, handleKeyDown } = useFocusTrap<HTMLDivElement>(true)

  const statusColors = {
    running: 'text-signal-green',
    completed: 'text-signal-blue',
    cancelled: 'text-signal-red',
    max_reached: 'text-signal-yellow',
  }

  const modeLabels = {
    yolo: 'Autonomous',
    review: 'Review Mode',
  }

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed right-0 top-0 h-full w-[480px] max-w-[90vw] bg-factory-panel border-l border-factory-border z-50 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="loop-details-title"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="sticky top-0 bg-factory-panel border-b border-factory-border p-4 flex items-center justify-between">
          <div>
            <h2 id="loop-details-title" className="text-sm font-bold text-gray-200">{loop.taskId}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs ${statusColors[loop.status]}`}>
                {loop.status.replace('_', ' ')}
              </span>
              <span className="text-[10px] text-gray-500">
                {loop.loopType === 'fresh' ? 'Fresh' : 'Persistent'}
              </span>
              <span className="text-[10px] text-gray-500">
                {modeLabels[loop.mode]}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 p-1"
            aria-label="Close details"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Progress */}
          <div className="factory-panel p-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Iteration Progress
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-factory-bg rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-signal-green"
                  initial={{ width: 0 }}
                  animate={{ width: `${(loop.iteration / loop.maxIterations) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="text-xs text-gray-300 font-mono">
                {loop.iteration}/{loop.maxIterations}
              </span>
            </div>
          </div>

          {/* Spec Preview */}
          {loop.spec && (
            <div className="factory-panel p-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Task Spec
              </h3>

              {/* Frontmatter info */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                <div>
                  <span className="text-gray-500">Max Iterations:</span>
                  <span className="ml-2 text-gray-300">{loop.spec.maxIterations}</span>
                </div>
                <div>
                  <span className="text-gray-500">Mode:</span>
                  <span className="ml-2 text-gray-300">{loop.spec.mode}</span>
                </div>
                {loop.spec.completionPromise && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Promise:</span>
                    <code className="ml-2 text-signal-green text-[11px] bg-factory-bg px-1 rounded">
                      {loop.spec.completionPromise}
                    </code>
                  </div>
                )}
              </div>

              {/* Task summary */}
              {loop.spec.taskSummary && (
                <p className="text-xs text-gray-300 mb-2 line-clamp-3">
                  {loop.spec.taskSummary}
                </p>
              )}

              {/* Full content */}
              <details className="text-xs">
                <summary className="text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
                  Show full spec
                </summary>
                <div className="mt-2 p-2 bg-factory-bg/50 rounded max-h-64 overflow-y-auto">
                  <pre className="text-gray-400 whitespace-pre-wrap font-mono text-[11px]">
                    {loop.spec.taskContent}
                  </pre>
                </div>
              </details>
            </div>
          )}

          {/* Meta info */}
          <div className="factory-panel p-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Details
            </h3>
            <dl className="grid grid-cols-2 gap-y-2 text-xs">
              <dt className="text-gray-500">Started</dt>
              <dd className="text-gray-300">{formatDateTime(loop.startedAt)}</dd>

              <dt className="text-gray-500">Project</dt>
              <dd className="text-gray-300 truncate" title={loop.projectPath}>
                {loop.projectPath.split('/').pop() || loop.projectPath}
              </dd>

              {loop.logsDir && (
                <>
                  <dt className="text-gray-500">Logs</dt>
                  <dd className="text-gray-300 truncate font-mono text-[11px]" title={loop.logsDir}>
                    {loop.logsDir.split('/').pop()}
                  </dd>
                </>
              )}

              {loop.stateFile && (
                <>
                  <dt className="text-gray-500">State File</dt>
                  <dd className="text-gray-300 truncate font-mono text-[11px]" title={loop.stateFile}>
                    {loop.stateFile.split('/').pop()}
                  </dd>
                </>
              )}
            </dl>
          </div>

          {/* Steering Panel (if pending) */}
          {loop.steeringStatus === 'pending' && (
            <SteeringPanel loop={loop} />
          )}

          {/* Previous steering response */}
          {steering?.status === 'answered' && steering.response && (
            <div className="factory-panel p-3 border-gray-600/30">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Last Steering Response
              </h3>
              <div className="text-xs text-gray-400 mb-1">
                Q: {steering.question}
              </div>
              <div className="text-xs text-gray-300 bg-factory-bg/50 rounded p-2">
                A: {steering.response}
              </div>
            </div>
          )}

          {/* Progress Display */}
          <ProgressDisplay taskId={loop.taskId} />

          {/* Summary Display (if completed) */}
          {summary && <SummaryDisplay taskId={loop.taskId} />}
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
