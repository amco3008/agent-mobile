import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useSocketStore } from '../../stores/socketStore'
import { RalphLoop } from '../../types'

interface LoopCardProps {
  loop: RalphLoop
  onClick?: () => void
}

const STATUS_COLORS: Record<RalphLoop['status'], string> = {
  running: 'text-signal-green',
  completed: 'text-signal-blue',
  cancelled: 'text-signal-red',
  max_reached: 'text-signal-yellow',
}

const STATUS_BG: Record<RalphLoop['status'], string> = {
  running: 'border-signal-green/30',
  completed: 'border-signal-blue/30',
  cancelled: 'border-signal-red/30',
  max_reached: 'border-signal-yellow/30',
}

export const LoopCard = memo(function LoopCard({ loop, onClick }: LoopCardProps) {
  const progress = useSocketStore((state) => state.ralphProgress.get(loop.taskId))

  const progressPercent = useMemo(() =>
    loop.maxIterations > 0 ? (loop.iteration / loop.maxIterations) * 100 : 0,
    [loop.iteration, loop.maxIterations]
  )

  const statusColor = STATUS_COLORS[loop.status]
  const borderColor = loop.steeringStatus === 'pending'
    ? 'border-signal-yellow/50'
    : STATUS_BG[loop.status]

  // Get display text - prefer progress summary, fall back to spec summary
  const displayText = progress?.summary || loop.spec?.taskSummary

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`factory-panel p-2 w-full text-left cursor-pointer hover:bg-factory-highlight/30 transition-colors ${borderColor}`}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      aria-label={`Loop ${loop.taskId}, ${loop.status}, ${loop.iteration} of ${loop.maxIterations} iterations`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-xs font-bold truncate">
            {loop.taskId}
          </span>
          {loop.containerName && (
            <span className="text-[9px] text-signal-blue bg-signal-blue/10 px-1 rounded flex-shrink-0">
              {loop.containerName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {loop.loopType === 'fresh' && (
            <span className="text-[9px] text-gray-500 bg-factory-bg px-1 rounded">
              fresh
            </span>
          )}
          <span className={`text-[10px] ${statusColor}`}>
            {loop.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-factory-bg rounded overflow-hidden mb-1">
        <div
          className={`h-full transition-all duration-300 ${
            loop.status === 'running' ? 'belt-progress' : 'bg-signal-green'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
        <span>
          {loop.iteration}/{loop.maxIterations || '?'}
        </span>
        <span className="capitalize">{loop.mode}</span>
      </div>

      {/* Summary/progress snippet */}
      {displayText && (
        <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
          {displayText}
        </p>
      )}

      {/* Steering indicator */}
      {loop.steeringStatus === 'pending' && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-1.5 px-1.5 py-0.5 bg-signal-yellow/20 border border-signal-yellow/30 rounded text-[10px] text-signal-yellow flex items-center gap-1"
        >
          <span className="animate-pulse">&#9888;</span>
          Needs input
        </motion.div>
      )}
    </motion.button>
  )
})
