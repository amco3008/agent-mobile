import { memo, useMemo } from 'react'
import { useTmuxSessions } from '../../api/hooks/useTmuxSessions'
import { useContainerSessions, useContainers } from '../../api/hooks/useContainers'
import { useDashboardStore } from '../../stores/dashboardStore'
import { SessionCard } from './SessionCard'
import type { TmuxPane, TmuxSession } from '../../types'

interface SessionGridProps {
  selectedSession: string | null
  onSelectSession: (sessionId: string | null) => void
  onOpenTerminal?: (sessionId: string, pane: TmuxPane) => void
}

export const SessionGrid = memo(function SessionGrid({ selectedSession, onSelectSession, onOpenTerminal }: SessionGridProps) {
  // Get container filter from dashboard store
  const selectedContainerId = useDashboardStore((state) => state.selectedContainerId)
  const { data: containers } = useContainers()

  // Local sessions (when "All Containers" is selected or as fallback)
  const { data: localSessions, isLoading: localLoading, error: localError } = useTmuxSessions()

  // Container-specific sessions (when a container is selected)
  const { data: containerSessionsData, isLoading: containerLoading, error: containerError } = useContainerSessions(selectedContainerId)

  // Determine which sessions to show
  const { sessions, isLoading, error, showContainerBadge } = useMemo(() => {
    if (selectedContainerId) {
      // Show sessions from selected container
      // Convert ContainerSession[] to TmuxSession[] format for SessionCard compatibility
      const containerSessions: TmuxSession[] = (containerSessionsData?.sessions || []).map(cs => ({
        id: cs.id,
        name: cs.name,
        created: new Date(),
        attached: false,
        windows: [], // Simplified - no window details from remote exec
        containerId: cs.containerId,
        containerName: cs.containerName,
      }))
      return {
        sessions: containerSessions,
        isLoading: containerLoading,
        error: containerError,
        showContainerBadge: false, // Already filtered to one container
      }
    }

    // "All Containers" mode - show local sessions
    // In a full multi-container setup, this would aggregate sessions from all containers
    return {
      sessions: localSessions || [],
      isLoading: localLoading,
      error: localError,
      showContainerBadge: (containers?.length ?? 0) > 1, // Show badge if multiple containers
    }
  }, [selectedContainerId, containerSessionsData, containerLoading, containerError, localSessions, localLoading, localError, containers])

  // Find container name for display
  const selectedContainerName = useMemo(() => {
    if (!selectedContainerId || !containers) return null
    return containers.find(c => c.id === selectedContainerId)?.name
  }, [selectedContainerId, containers])

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
          />
        ))}
      </div>
    </div>
  )
})
