import { useEffect, useState } from 'react'
import { ZoomControls } from '../factorio/ZoomControls'
import { useRalphLoops } from '../../api/hooks/useRalphLoops'
import { useTmuxSessions } from '../../api/hooks/useTmuxSessions'

export function StatusBar() {
  const [time, setTime] = useState(new Date())
  const { data: loops } = useRalphLoops()
  const { data: sessions } = useTmuxSessions()

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const activeLoops = loops?.filter(l => l.status === 'running').length || 0
  const activeSessions = sessions?.filter(s => s.attached).length || 0

  return (
    <footer className="h-8 border-t border-factory-border flex items-center px-4 text-xs bg-factory-panel">
      {/* Left: Zoom controls */}
      <ZoomControls />

      {/* Center: Status indicators */}
      <div className="flex-1 flex items-center justify-center gap-6">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${activeSessions > 0 ? 'bg-signal-green' : 'bg-gray-500'}`} />
          <span className="text-gray-400">
            {sessions?.length || 0} sessions
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${activeLoops > 0 ? 'bg-signal-green animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-gray-400">
            {activeLoops} active loops
          </span>
        </div>
      </div>

      {/* Right: Port and time */}
      <div className="flex items-center gap-4 text-gray-500">
        <span>Port: 9091</span>
        <span className="text-signal-yellow font-mono">
          {time.toLocaleTimeString()}
        </span>
      </div>
    </footer>
  )
}
