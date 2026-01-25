import { motion } from 'framer-motion'
import { useTmuxSessions } from '../../api/hooks/useTmuxSessions'
import { useRalphLoops } from '../../api/hooks/useRalphLoops'

interface MiniMapProps {
  onSelectSession?: (sessionId: string) => void
}

export function MiniMap({ onSelectSession }: MiniMapProps) {
  const { data: sessions } = useTmuxSessions()
  const { data: loops } = useRalphLoops()

  return (
    <div className="factory-panel p-2">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
        Mini Map
      </div>
      <div className="relative w-full h-24 bg-factory-bg rounded border border-factory-border overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'linear-gradient(#404040 1px, transparent 1px), linear-gradient(90deg, #404040 1px, transparent 1px)',
            backgroundSize: '10px 10px',
          }}
        />

        {/* Session markers */}
        {sessions?.map((session, i) => (
          <motion.div
            key={session.id}
            className={`absolute w-4 h-4 rounded cursor-pointer ${
              session.attached ? 'bg-signal-green' : 'bg-signal-yellow'
            }`}
            style={{
              left: `${10 + (i % 4) * 22}%`,
              top: `${20 + Math.floor(i / 4) * 30}%`,
            }}
            whileHover={{ scale: 1.5 }}
            onClick={() => onSelectSession?.(session.id)}
            title={`Session: ${session.name}`}
          />
        ))}

        {/* Ralph loop markers */}
        {loops?.map((loop, i) => (
          <motion.div
            key={loop.taskId}
            className={`absolute w-3 h-3 rounded-full ${
              loop.status === 'running'
                ? 'bg-signal-green animate-pulse'
                : loop.status === 'completed'
                ? 'bg-signal-blue'
                : 'bg-signal-red'
            }`}
            style={{
              right: `${10 + (i % 3) * 15}%`,
              bottom: `${15 + Math.floor(i / 3) * 25}%`,
            }}
            title={`Ralph: ${loop.taskId}`}
          />
        ))}

        {/* Legend */}
        <div className="absolute bottom-1 left-1 flex gap-2 text-[8px] text-gray-500">
          <span>■ Session</span>
          <span>● Ralph</span>
        </div>
      </div>
    </div>
  )
}
