import { MouseEvent } from 'react'
import { TmuxPane } from '../../types'

interface PanePreviewProps {
  pane: TmuxPane
  onClick?: (e: MouseEvent) => void
}

export function PanePreview({ pane, onClick }: PanePreviewProps) {
  return (
    <div
      className={`bg-black/50 rounded text-[8px] leading-tight p-1 font-mono overflow-hidden cursor-pointer hover:bg-black/70 transition-colors ${
        pane.active ? 'ring-1 ring-signal-green' : ''
      }`}
      style={{ height: '60px' }}
      onClick={onClick}
      title="Click to open terminal"
    >
      {/* Pane header */}
      <div className="flex items-center justify-between mb-0.5 text-gray-500">
        <span>#{pane.id}</span>
        <span>{pane.width}x{pane.height}</span>
      </div>

      {/* Preview content placeholder */}
      <div className="text-gray-400 whitespace-pre overflow-hidden">
        {pane.command || 'bash'}
        {'\n'}
        <span className="text-signal-green">$</span> _
      </div>
    </div>
  )
}
