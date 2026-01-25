import { useState, useEffect } from 'react'
import { DashboardLayout } from './components/layout/DashboardLayout'
import { Sidebar } from './components/layout/Sidebar'
import { SessionGrid } from './components/tmux/SessionGrid'
import { ResourceMonitor } from './components/system/ResourceMonitor'
import { ThroughputStats } from './components/system/ThroughputStats'
import { LoopList } from './components/ralph/LoopList'
import { ProductionChain } from './components/ralph/ProductionChain'
import { SteeringPanel } from './components/ralph/SteeringPanel'
import { PaneTerminal } from './components/tmux/PaneTerminal'
import { useTmuxSession } from './api/hooks/useTmuxSessions'
import { useRalphLoops } from './api/hooks/useRalphLoops'
import { getSocket } from './api/socket'
import type { TmuxPane } from './types'

interface TerminalState {
  sessionId: string
  pane: TmuxPane
}

function App() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [openTerminal, setOpenTerminal] = useState<TerminalState | null>(null)

  // Initialize socket connection
  useEffect(() => {
    getSocket()
  }, [])

  // Get selected session details
  const { data: sessionDetails } = useTmuxSession(selectedSession)

  // Get Ralph loops for production chain display
  const { data: loops } = useRalphLoops()
  const activeLoop = loops?.find(l => l.status === 'running')
  const pendingSteeringLoop = loops?.find(l => l.steeringStatus === 'pending')

  // Handle pane click to open terminal
  const handleOpenTerminal = (sessionId: string, pane: TmuxPane) => {
    setOpenTerminal({ sessionId, pane })
  }

  return (
    <DashboardLayout>
      <Sidebar
        selectedSession={selectedSession}
        onSelectSession={setSelectedSession}
      >
        <LoopList />
      </Sidebar>

      <main className="flex-1 p-4 overflow-auto flex flex-col gap-4">
        {/* Steering panel when needed */}
        {pendingSteeringLoop && (
          <SteeringPanel loop={pendingSteeringLoop} />
        )}

        {/* Production chain for active loop */}
        {activeLoop && (
          <ProductionChain loop={activeLoop} />
        )}

        {/* Terminal view when open */}
        {openTerminal && (
          <div className="h-96 flex-shrink-0">
            <PaneTerminal
              sessionId={openTerminal.sessionId}
              pane={openTerminal.pane}
              onClose={() => setOpenTerminal(null)}
            />
          </div>
        )}

        {/* Session grid */}
        <div className="flex-1 min-h-0">
          <SessionGrid
            selectedSession={selectedSession}
            onSelectSession={setSelectedSession}
            onOpenTerminal={handleOpenTerminal}
          />
        </div>
      </main>

      <aside className="w-80 border-l border-factory-border p-4 overflow-auto space-y-4">
        <ResourceMonitor />
        <ThroughputStats />

        {/* Session details when selected */}
        {sessionDetails && (
          <div className="factory-panel p-3">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Session: {sessionDetails.name}
            </h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Windows:</span>
                <span>{sessionDetails.windows.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Attached:</span>
                <span className={sessionDetails.attached ? 'text-signal-green' : 'text-signal-yellow'}>
                  {sessionDetails.attached ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Panes:</span>
                <span>
                  {sessionDetails.windows.reduce((acc, w) => acc + w.panes.length, 0)}
                </span>
              </div>
            </div>
          </div>
        )}
      </aside>
    </DashboardLayout>
  )
}

export default App
