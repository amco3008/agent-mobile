import { useState, useCallback, memo, useMemo } from 'react'
import { useRalphLoops } from '../../api/hooks/useRalphLoops'
import { useSocketStore } from '../../stores/socketStore'
import { useDashboardStore } from '../../stores/dashboardStore'
import { LoopCard } from './LoopCard'
import { LoopDetails } from './LoopDetails'
import type { RalphLoop } from '../../types'

export const LoopList = memo(function LoopList() {
  // Local loops (from this container or host)
  const { data: localLoops, isLoading, error } = useRalphLoops()

  // Selected container for filtering
  const selectedContainerId = useDashboardStore((state) => state.selectedContainerId)

  // Container loops from socket store
  const containerRalphLoops = useSocketStore((state) => state.containerRalphLoops)
  const containers = useSocketStore((state) => state.containers)

  const [selectedLoop, setSelectedLoop] = useState<RalphLoop | null>(null)

  // Compute displayed loops based on selection
  const displayedLoops = useMemo(() => {
    if (selectedContainerId === null) {
      // "All Containers" - show local loops + all subscribed container loops
      const allLoops: RalphLoop[] = [...(localLoops || [])]

      // Add loops from subscribed containers
      for (const [containerId, loopsMap] of containerRalphLoops) {
        const container = containers.find(c => c.id === containerId)
        const containerName = container?.name || containerId.substring(0, 12)

        for (const loop of loopsMap.values()) {
          allLoops.push({
            ...loop,
            containerId,
            containerName,
          })
        }
      }

      return allLoops
    } else {
      // Specific container selected - show only that container's loops
      const containerLoops = containerRalphLoops.get(selectedContainerId)
      if (!containerLoops) return []

      const container = containers.find(c => c.id === selectedContainerId)
      const containerName = container?.name || selectedContainerId.substring(0, 12)

      return Array.from(containerLoops.values()).map(loop => ({
        ...loop,
        containerId: selectedContainerId,
        containerName,
      }))
    }
  }, [localLoops, selectedContainerId, containerRalphLoops, containers])

  const handleSelectLoop = useCallback((loop: RalphLoop) => {
    setSelectedLoop(loop)
  }, [])

  const handleCloseDetails = useCallback(() => {
    setSelectedLoop(null)
  }, [])

  if (isLoading && selectedContainerId === null) {
    return (
      <div className="text-xs text-signal-yellow animate-pulse">
        Loading loops...
      </div>
    )
  }

  if (error && selectedContainerId === null) {
    return (
      <div className="text-xs text-signal-red">
        Error: {error.message}
      </div>
    )
  }

  if (displayedLoops.length === 0) {
    return (
      <div className="text-xs text-gray-500 italic">
        {selectedContainerId
          ? 'No active loops in this container'
          : 'No active Ralph loops'}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {displayedLoops.map((loop) => (
          <LoopCard
            key={`${loop.containerId || 'local'}-${loop.taskId}`}
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
