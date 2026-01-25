import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { getSocket, subscribeToTerminal, unsubscribeFromTerminal, sendTerminalInput } from '../../api/socket'
import type { TmuxPane } from '../../types'
import 'xterm/css/xterm.css'

interface PaneTerminalProps {
  sessionId: string
  pane: TmuxPane
  onClose?: () => void
}

export function PaneTerminal({ sessionId, pane, onClose }: PaneTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  const paneId = String(pane.id)

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#00ff00',
        cursorAccent: '#1a1a1a',
        selectionBackground: '#404040',
        black: '#1a1a1a',
        red: '#ff3333',
        green: '#00ff00',
        yellow: '#ffcc00',
        blue: '#3399ff',
        magenta: '#cc66ff',
        cyan: '#00cccc',
        white: '#e0e0e0',
        brightBlack: '#666666',
        brightRed: '#ff6666',
        brightGreen: '#66ff66',
        brightYellow: '#ffff66',
        brightBlue: '#66b3ff',
        brightMagenta: '#ff99ff',
        brightCyan: '#66ffff',
        brightWhite: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminal.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = terminal
    fitAddonRef.current = fitAddon

    // Subscribe to terminal output
    const socket = getSocket()
    subscribeToTerminal(sessionId, paneId)

    // Handle incoming data
    const handleOutput = (data: { sessionId: string; paneId: string; data: string }) => {
      if (data.sessionId === sessionId && data.paneId === paneId) {
        terminal.write(data.data)
      }
    }
    socket.on('tmux:pane:output', handleOutput)

    // Handle user input
    terminal.onData((data) => {
      sendTerminalInput(sessionId, paneId, data)
    })

    // Handle resize
    const handleResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      socket.off('tmux:pane:output', handleOutput)
      unsubscribeFromTerminal(sessionId, paneId)
      window.removeEventListener('resize', handleResize)
      terminal.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId, paneId])

  // Handle resize when container size changes
  const handleContainerResize = useCallback(() => {
    if (fitAddonRef.current) {
      fitAddonRef.current.fit()
    }
  }, [])

  useEffect(() => {
    const resizeObserver = new ResizeObserver(handleContainerResize)
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }
    return () => resizeObserver.disconnect()
  }, [handleContainerResize])

  return (
    <div className="flex flex-col h-full bg-factory-bg border border-factory-border rounded-lg overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-factory-panel border-b border-factory-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
          <span className="text-xs text-gray-400">
            {sessionId}:{pane.id} - {pane.command}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-signal-red transition-colors text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {/* Terminal content */}
      <div
        ref={terminalRef}
        className="flex-1 p-1"
        style={{ minHeight: '200px' }}
      />
    </div>
  )
}
