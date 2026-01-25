import { useRalphLoops } from '../../api/hooks/useRalphLoops'
import { LoopCard } from './LoopCard'

export function LoopList() {
  const { data: loops, isLoading, error } = useRalphLoops()

  if (isLoading) {
    return (
      <div className="text-xs text-signal-yellow animate-pulse">
        Loading loops...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-xs text-signal-red">
        Error: {error.message}
      </div>
    )
  }

  if (!loops || loops.length === 0) {
    return (
      <div className="text-xs text-gray-500 italic">
        No active Ralph loops
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {loops.map((loop) => (
        <LoopCard key={loop.taskId} loop={loop} />
      ))}
    </div>
  )
}
