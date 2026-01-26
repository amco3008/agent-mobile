import { memo, ReactNode, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTmuxSessions } from '../../api/hooks/useTmuxSessions'
import { useContainers } from '../../api/hooks/useContainers'
import { useDashboardStore } from '../../stores/dashboardStore'
import { MiniMap } from '../factorio/MiniMap'
import type { TmuxSession, Container } from '../../types'

interface SidebarProps {
  children: ReactNode
  selectedSession?: string | null
  onSelectSession?: (sessionId: string) => void
  onNewRalph?: () => void
}

// Memoized session item component
interface SessionItemProps {
  session: TmuxSession
  index: number
  isSelected: boolean
  onSelect: () => void
}

const SessionItem = memo(function SessionItem({ session, index, isSelected, onSelect }: SessionItemProps) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-left ${
        isSelected
          ? 'bg-signal-green/10 border border-signal-green/30'
          : 'hover:bg-factory-highlight border border-transparent'
      }`}
      aria-pressed={isSelected}
      aria-label={`Session ${session.name}${session.attached ? ' (attached)' : ''}`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          session.attached ? 'bg-signal-green' : 'bg-signal-yellow'
        }`}
        aria-hidden="true"
      />
      <span className="text-xs truncate flex-1">{session.name}</span>
      <span className="text-[10px] text-gray-500">
        {session.windows.length}w
      </span>
    </motion.button>
  )
})

// Memoized container item component
interface ContainerItemProps {
  container: Container
  index: number
  isSelected: boolean
  onSelect: () => void
}

const statusColors: Record<string, string> = {
  running: 'bg-signal-green',
  exited: 'bg-gray-500',
  paused: 'bg-signal-yellow',
  created: 'bg-blue-500',
  restarting: 'bg-signal-yellow animate-pulse',
  removing: 'bg-signal-red animate-pulse',
  dead: 'bg-signal-red',
}

const ContainerItem = memo(function ContainerItem({ container, index, isSelected, onSelect }: ContainerItemProps) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-left ${
        isSelected
          ? 'bg-signal-blue/10 border border-signal-blue/30'
          : 'hover:bg-factory-highlight border border-transparent'
      }`}
      aria-pressed={isSelected}
      aria-label={`Container ${container.name} (${container.status})`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[container.status] || 'bg-gray-500'}`}
        aria-hidden="true"
      />
      <span className="text-xs truncate flex-1">{container.name}</span>
      <span className="text-[10px] text-gray-500">{container.status}</span>
    </motion.button>
  )
})

export const Sidebar = memo(function Sidebar({ children, selectedSession, onSelectSession, onNewRalph }: SidebarProps) {
  const { data: sessions, isLoading: sessionsLoading, error: sessionsError } = useTmuxSessions()
  const { data: containers, isLoading: containersLoading, error: containersError } = useContainers()

  // Container selection state
  const selectedContainerId = useDashboardStore((state) => state.selectedContainerId)
  const setSelectedContainer = useDashboardStore((state) => state.setSelectedContainer)

  // Memoize callback creator
  const handleSelectSession = useCallback((sessionId: string) => {
    onSelectSession?.(sessionId)
  }, [onSelectSession])

  const handleSelectContainer = useCallback((containerId: string | null) => {
    setSelectedContainer(containerId)
  }, [setSelectedContainer])

  // Count running containers
  const runningCount = containers?.filter(c => c.status === 'running').length || 0

  return (
    <aside className="w-64 border-r border-factory-border flex flex-col bg-factory-panel/50">
      {/* Mini map */}
      <div className="p-2 border-b border-factory-border">
        <MiniMap onSelectSession={onSelectSession} />
      </div>

      {/* Containers section - acts as filter selector */}
      <div className="p-3 border-b border-factory-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Containers
          </h2>
          {containers && containers.length > 0 && (
            <span className="text-[10px] text-gray-500">
              {runningCount} running
            </span>
          )}
        </div>
        {containersError ? (
          <div className="text-xs text-signal-red">Failed to load</div>
        ) : containersLoading ? (
          <div className="text-xs text-signal-yellow animate-pulse">Loading...</div>
        ) : !containers || containers.length === 0 ? (
          <div className="text-xs text-gray-500 italic">No containers</div>
        ) : (
          <div className="space-y-1">
            {/* All Containers option */}
            <motion.button
              type="button"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => handleSelectContainer(null)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors text-left ${
                selectedContainerId === null
                  ? 'bg-signal-blue/10 border border-signal-blue/30'
                  : 'hover:bg-factory-highlight border border-transparent'
              }`}
              aria-pressed={selectedContainerId === null}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-signal-blue" aria-hidden="true" />
              <span className="text-xs flex-1">All Containers</span>
              <span className="text-[10px] text-gray-500">{containers.length}</span>
            </motion.button>

            {/* Individual containers */}
            {containers.map((container, i) => (
              <ContainerItem
                key={container.id}
                container={container}
                index={i + 1}
                isSelected={selectedContainerId === container.id}
                onSelect={() => handleSelectContainer(container.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sessions section */}
      <div className="p-3 border-b border-factory-border">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          Tmux Sessions
        </h2>
        {sessionsError ? (
          <div className="text-xs text-signal-red">Failed to load</div>
        ) : sessionsLoading ? (
          <div className="text-xs text-signal-yellow animate-pulse">Loading...</div>
        ) : !sessions || sessions.length === 0 ? (
          <div className="text-xs text-gray-500 italic">No sessions</div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session, i) => (
              <SessionItem
                key={session.id}
                session={session}
                index={i}
                isSelected={selectedSession === session.id}
                onSelect={() => handleSelectSession(session.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Ralph loops section */}
      <div className="flex-1 p-3 overflow-auto flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Ralph Loops
          </h2>
          {onNewRalph && (
            <motion.button
              type="button"
              onClick={onNewRalph}
              className="px-2 py-1 text-[10px] text-signal-green border border-signal-green/30 rounded hover:bg-signal-green/10 transition-colors flex items-center gap-1"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Start new Ralph session"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </motion.button>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </aside>
  )
})
