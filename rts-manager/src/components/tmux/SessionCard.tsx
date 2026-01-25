import { memo, useMemo } from 'react'
import { TmuxSession, TmuxPane } from '../../types'
import { PanePreview } from './PanePreview'

interface SessionCardProps {
  session: TmuxSession
  isSelected: boolean
  onSelect: () => void
  onOpenTerminal?: (sessionId: string, pane: TmuxPane) => void
}

export const SessionCard = memo(function SessionCard({ session, isSelected, onSelect, onOpenTerminal }: SessionCardProps) {
  const activeWindow = useMemo(() =>
    session.windows.find(w => w.active) || session.windows[0],
    [session.windows]
  )

  return (
    <div
      className={`session-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              session.attached ? 'bg-signal-green' : 'bg-signal-yellow'
            }`}
          />
          <span className="font-bold text-sm">{session.name}</span>
        </div>
        <span className="text-xs text-gray-500">
          {session.windows.length} window{session.windows.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Window tabs */}
      <div className="flex gap-1 mb-2 overflow-x-auto">
        {session.windows.map((window) => (
          <div
            key={window.id}
            className={`px-2 py-0.5 text-xs rounded ${
              window.active
                ? 'bg-signal-green/20 text-signal-green border border-signal-green/30'
                : 'bg-factory-bg text-gray-400 border border-factory-border'
            }`}
          >
            {window.name}
          </div>
        ))}
      </div>

      {/* Pane preview grid */}
      {activeWindow && (
        <div className="bg-factory-bg rounded border border-factory-border p-1">
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${Math.min(activeWindow.panes.length, 2)}, 1fr)`,
            }}
          >
            {activeWindow.panes.slice(0, 4).map((pane) => (
              <PanePreview
                key={pane.id}
                pane={pane}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenTerminal?.(session.id, pane)
                }}
              />
            ))}
          </div>
          {activeWindow.panes.length > 4 && (
            <div className="text-xs text-gray-500 text-center mt-1">
              +{activeWindow.panes.length - 4} more panes
            </div>
          )}
        </div>
      )}
    </div>
  )
})
