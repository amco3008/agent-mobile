import { memo, useState } from 'react'
import type { Container } from '../../types'
import { useContainerActions } from '../../api/hooks/useContainers'

interface ContainerCardProps {
  container: Container
  isSelected?: boolean
  onSelect?: () => void
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

const healthColors: Record<string, string> = {
  healthy: 'text-signal-green',
  unhealthy: 'text-signal-red',
  starting: 'text-signal-yellow',
  none: 'text-gray-500',
}

type ConfirmAction = 'stop' | 'restart' | null

export const ContainerCard = memo(function ContainerCard({
  container,
  isSelected,
  onSelect,
}: ContainerCardProps) {
  const { start, stop, restart } = useContainerActions(container.id)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  const handleStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    start.mutate()
  }

  const handleStopClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmAction('stop')
  }

  const handleRestartClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmAction('restart')
  }

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmAction === 'stop') {
      stop.mutate()
    } else if (confirmAction === 'restart') {
      restart.mutate()
    }
    setConfirmAction(null)
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmAction(null)
  }

  return (
    <div
      className={`p-4 rounded-lg border transition-colors cursor-pointer ${
        isSelected
          ? 'border-signal-yellow bg-factory-panel'
          : 'border-factory-border bg-factory-panel hover:border-gray-600'
      }`}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${statusColors[container.status] || 'bg-gray-500'}`}
          />
          <h3 className="font-mono text-sm font-bold truncate">{container.name}</h3>
        </div>
      </div>

      {/* Details */}
      <div className="text-xs text-gray-400 space-y-1 mb-3">
        <div className="truncate" title={container.image}>
          Image: {container.image.split('/').pop()}
        </div>
        <div className="flex items-center gap-2">
          <span>Status: {container.status}</span>
          {container.health && container.health !== 'none' && (
            <span className={healthColors[container.health]}>
              ({container.health})
            </span>
          )}
        </div>
        {container.tailscaleIp && (
          <div>IP: {container.tailscaleIp}</div>
        )}
        {container.ports.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {container.ports.slice(0, 3).map((port, i) => (
              <span
                key={i}
                className="px-1 py-0.5 bg-factory-bg rounded text-xs"
              >
                {port.public ? `${port.public}:` : ''}{port.private}/{port.type}
              </span>
            ))}
            {container.ports.length > 3 && (
              <span className="text-gray-500">+{container.ports.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {confirmAction ? (
          // Confirmation dialog
          <div className="flex items-center gap-2 text-xs">
            <span className="text-signal-yellow">
              {confirmAction === 'stop' ? 'Stop' : 'Restart'} container?
            </span>
            <button
              onClick={handleConfirm}
              className="px-2 py-1 bg-signal-red/20 text-signal-red border border-signal-red/30 rounded hover:bg-signal-red/30"
              aria-label={`Confirm ${confirmAction}`}
            >
              Yes
            </button>
            <button
              onClick={handleCancel}
              className="px-2 py-1 bg-gray-500/20 text-gray-400 border border-gray-500/30 rounded hover:bg-gray-500/30"
              aria-label="Cancel"
            >
              No
            </button>
          </div>
        ) : (
          <>
            {container.status !== 'running' && (
              <button
                onClick={handleStart}
                disabled={start.isPending}
                className="px-2 py-1 text-xs bg-signal-green/20 text-signal-green border border-signal-green/30 rounded hover:bg-signal-green/30 disabled:opacity-50"
                aria-label={`Start container ${container.name}`}
              >
                {start.isPending ? 'Starting...' : 'Start'}
              </button>
            )}
            {container.status === 'running' && (
              <>
                <button
                  onClick={handleStopClick}
                  disabled={stop.isPending}
                  className="px-2 py-1 text-xs bg-signal-red/20 text-signal-red border border-signal-red/30 rounded hover:bg-signal-red/30 disabled:opacity-50"
                  aria-label={`Stop container ${container.name}`}
                >
                  {stop.isPending ? 'Stopping...' : 'Stop'}
                </button>
                <button
                  onClick={handleRestartClick}
                  disabled={restart.isPending}
                  className="px-2 py-1 text-xs bg-signal-yellow/20 text-signal-yellow border border-signal-yellow/30 rounded hover:bg-signal-yellow/30 disabled:opacity-50"
                  aria-label={`Restart container ${container.name}`}
                >
                  {restart.isPending ? 'Restarting...' : 'Restart'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
})
