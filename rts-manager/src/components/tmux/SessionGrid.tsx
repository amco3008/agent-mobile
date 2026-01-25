import { useTmuxSessions } from '../../api/hooks/useTmuxSessions'
import { SessionCard } from './SessionCard'
import type { TmuxPane } from '../../types'

interface SessionGridProps {
  selectedSession: string | null
  onSelectSession: (sessionId: string | null) => void
  onOpenTerminal?: (sessionId: string, pane: TmuxPane) => void
}

export function SessionGrid({ selectedSession, onSelectSession, onOpenTerminal }: SessionGridProps) {
  const { data: sessions, isLoading, error } = useTmuxSessions()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-signal-yellow animate-pulse">
          Loading tmux sessions...
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
          <div className="text-gray-400 mb-2">No tmux sessions found</div>
          <div className="text-xs text-gray-500">
            Start a tmux session to see it here
          </div>
        </div>
      </div>
    )
  }

  return (
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
        />
      ))}
    </div>
  )
}
