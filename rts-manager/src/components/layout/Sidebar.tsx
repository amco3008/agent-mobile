import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useTmuxSessions } from '../../api/hooks/useTmuxSessions'
import { MiniMap } from '../factorio/MiniMap'

interface SidebarProps {
  children: ReactNode
  selectedSession?: string | null
  onSelectSession?: (sessionId: string) => void
}

export function Sidebar({ children, selectedSession, onSelectSession }: SidebarProps) {
  const { data: sessions, isLoading } = useTmuxSessions()

  return (
    <aside className="w-64 border-r border-factory-border flex flex-col bg-factory-panel/50">
      {/* Mini map */}
      <div className="p-2 border-b border-factory-border">
        <MiniMap onSelectSession={onSelectSession} />
      </div>

      {/* Sessions section */}
      <div className="p-3 border-b border-factory-border">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          Tmux Sessions
        </h2>
        {isLoading ? (
          <div className="text-xs text-signal-yellow animate-pulse">Loading...</div>
        ) : !sessions || sessions.length === 0 ? (
          <div className="text-xs text-gray-500 italic">No sessions</div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session, i) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => onSelectSession?.(session.id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                  selectedSession === session.id
                    ? 'bg-signal-green/10 border border-signal-green/30'
                    : 'hover:bg-factory-highlight border border-transparent'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    session.attached ? 'bg-signal-green' : 'bg-signal-yellow'
                  }`}
                />
                <span className="text-xs truncate flex-1">{session.name}</span>
                <span className="text-[10px] text-gray-500">
                  {session.windows.length}w
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Ralph loops section */}
      <div className="flex-1 p-3 overflow-auto">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
          Ralph Loops
        </h2>
        {children}
      </div>
    </aside>
  )
}
