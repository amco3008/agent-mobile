import { memo, useMemo } from 'react'
import { useTmuxSessions } from '../../api/hooks/useTmuxSessions'
import { useContainerSessions, useContainers } from '../../api/hooks/useContainers'
import { useDashboardStore } from '../../stores/dashboardStore'
import { useSocketStore } from '../../stores/socketStore'
import { SessionCard } from './SessionCard'
import type { TmuxPane, TmuxSession } from '../../types'

interface SessionGridProps {
  selectedSession: string | null
  onSelectSession: (sessionId: string | null) => void
  onOpenTerminal?: (sessionId: string, pane: TmuxPane) => void
}

export const SessionGrid = memo(function SessionGrid({ selectedSession, onSelectSession, onOpenTerminal }: SessionGridProps) {
  // Get zoom level and container filter from dashboard store
  const zoomLevel = useDashboardStore((state) => state.zoomLevel)
  const selectedContainerId = useDashboardStore((state) => state.selectedContainerId)
  const { data: containers } = useContainers()

  // Local sessions (when "All Containers" is selected or as fallback)
  const { data: localSessions, isLoading: localLoading, error: localError } = useTmuxSessions()

  // Container-specific sessions from socket store (populated by subscription)
  const containerTmuxSessions = useSocketStore((state) => state.containerTmuxSessions)

  // Fallback to API-based container sessions if socket data not available
  const { data: containerSessionsData, isLoading: containerLoading, error: containerError } = useContainerSessions(selectedContainerId)

  // Determine which sessions to show
  const { sessions, isLoading, error, showContainerBadge } = useMemo(() => {
    if (selectedContainerId) {
      // Always include local sessions (host tmux)
      const allSessions: TmuxSession[] = [...(localSessions || [])]

      // Prefer socket store data if available (real-time updates)
      const socketSessions = containerTmuxSessions.get(selectedContainerId)
      if (socketSessions && socketSessions.length > 0) {
        const container = containers?.find(c => c.id === selectedContainerId)
        for (const session of socketSessions) {
          allSessions.push({
            ...session,
            containerId: selectedContainerId,
            containerName: container?.name || selectedContainerId.substring(0, 12),
          })
        }
      } else if (containerSessionsData?.sessions) {
        // Fallback to API-based container sessions
        for (const cs of containerSessionsData.sessions) {
          allSessions.push({
            id: cs.id,
            name: cs.name,
            created: new Date(),
            attached: false,
            windows: [],
            containerId: cs.containerId,
            containerName: cs.containerName,
          })
        }
      }

      return {
        sessions: allSessions,
        isLoading: containerLoading,
        error: containerError,
        showContainerBadge: true,
      }
    }

    // "All Containers" mode - show local sessions + all subscribed container sessions
    const allSessions: TmuxSession[] = [...(localSessions || [])]

    // Add sessions from subscribed containers
    for (const [containerId, sessions] of containerTmuxSessions) {
      const container = containers?.find(c => c.id === containerId)
      const containerName = container?.name || containerId.substring(0, 12)

      for (const session of sessions) {
        allSessions.push({
          ...session,
          containerId,
          containerName,
        })
      }
    }

    return {
      sessions: allSessions,
      isLoading: localLoading,
      error: localError,
      showContainerBadge: (containers?.length ?? 0) > 1 || containerTmuxSessions.size > 0,
    }
  }, [selectedContainerId, containerTmuxSessions, containerSessionsData, containerLoading, containerError, localSessions, localLoading, localError, containers])

  // Find container name for display
  const selectedContainerName = useMemo(() => {
    if (!selectedContainerId || !containers) return null
    return containers.find(c => c.id === selectedContainerId)?.name
  }, [selectedContainerId, containers])

  // Get grid classes based on zoom level
  const gridClasses = useMemo(() => {
    switch (zoomLevel) {
      case 1: // Overview - compact cards
        return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3'
      case 2: // Session - medium cards (default)
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
      case 3: // Terminal - large cards with more detail
        return 'grid-cols-1 lg:grid-cols-2 gap-6'
      default:
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
    }
  }, [zoomLevel])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-signal-yellow animate-pulse">
          Loading tmux sessions{selectedContainerName ? ` from ${selectedContainerName}` : ''}...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-signal-red">
          Error loading sessions: {error.message}
        </div>
      </div>
    )
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-gray-400 mb-2">
            No tmux sessions found{selectedContainerName ? ` in ${selectedContainerName}` : ''}
          </div>
          <div className="text-xs text-gray-500">
            {selectedContainerId
              ? 'Start a tmux session in this container to see it here'
              : 'Start a tmux session to see it here'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Container context header when filtered */}
      {selectedContainerName && (
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-signal-blue" />
          Showing sessions from: <span className="font-mono text-gray-400">{selectedContainerName}</span>
        </div>
      )}

      <div className={`grid ${gridClasses}`}>
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isSelected={selectedSession === session.id}
            onSelect={() => onSelectSession(
              selectedSession === session.id ? null : session.id
            )}
            onOpenTerminal={onOpenTerminal}
            showContainerBadge={showContainerBadge}
            compact={zoomLevel === 1}
          />
        ))}
      </div>
    </div>
  )
})
