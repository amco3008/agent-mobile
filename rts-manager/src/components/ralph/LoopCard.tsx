import { RalphLoop } from '../../types'

interface LoopCardProps {
  loop: RalphLoop
}

export function LoopCard({ loop }: LoopCardProps) {
  const progress = loop.maxIterations > 0
    ? (loop.iteration / loop.maxIterations) * 100
    : 0

  const statusColor = {
    running: 'text-signal-green',
    completed: 'text-signal-blue',
    cancelled: 'text-signal-red',
    max_reached: 'text-signal-yellow',
  }[loop.status]

  return (
    <div className="factory-panel p-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold truncate flex-1">
          {loop.taskId}
        </span>
        <span className={`text-[10px] ${statusColor}`}>
          {loop.status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-factory-bg rounded overflow-hidden mb-1">
        <div
          className={`h-full transition-all duration-300 ${
            loop.status === 'running' ? 'belt-progress' : 'bg-signal-green'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>
          {loop.iteration}/{loop.maxIterations || '∞'}
        </span>
        <span className="capitalize">{loop.mode}</span>
      </div>

      {/* Steering indicator */}
      {loop.steeringStatus === 'pending' && (
        <div className="mt-1 px-1.5 py-0.5 bg-signal-yellow/20 border border-signal-yellow/30 rounded text-[10px] text-signal-yellow">
          Needs input
        </div>
      )}
    </div>
  )
}
