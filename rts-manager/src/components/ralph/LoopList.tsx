import { useState, useCallback, memo } from 'react'
import { useRalphLoops } from '../../api/hooks/useRalphLoops'
import { LoopCard } from './LoopCard'
import { LoopDetails } from './LoopDetails'
import type { RalphLoop } from '../../types'

export const LoopList = memo(function LoopList() {
  const { data: loops, isLoading, error } = useRalphLoops()
  const [selectedLoop, setSelectedLoop] = useState<RalphLoop | null>(null)

  const handleSelectLoop = useCallback((loop: RalphLoop) => {
    setSelectedLoop(loop)
  }, [])

  const handleCloseDetails = useCallback(() => {
    setSelectedLoop(null)
  }, [])

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
    <>
      <div className="space-y-2">
        {loops.map((loop) => (
          <LoopCard
            key={loop.taskId}
            loop={loop}
            onClick={() => handleSelectLoop(loop)}
          />
        ))}
      </div>

      {/* Details modal */}
      {selectedLoop && (
        <LoopDetails
          loop={selectedLoop}
          onClose={handleCloseDetails}
        />
      )}
    </>
  )
})
