import { useEffect, useRef, useMemo, useState, memo } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { getSocket, subscribeToTerminal, unsubscribeFromTerminal, sendTerminalInput, sendTerminalResize } from '../../api/socket'
import { useSocketStore } from '../../stores/socketStore'
import type { TmuxPane } from '../../types'
import 'xterm/css/xterm.css'

// Debounce utility
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

interface PaneTerminalProps {
  sessionId: string
  pane: TmuxPane
  onClose?: () => void
}

export const PaneTerminal = memo(function PaneTerminal({ sessionId, pane, onClose }: PaneTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [rateLimited, setRateLimited] = useState(false)

  const paneId = String(pane.id)

  // Track connection status from socket store
  const connected = useSocketStore((state) => state.connected)

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

    // Handle rate limit warnings from server
    const handleRateLimit = ({ message }: { message: string }) => {
      if (message.includes('Rate limit')) {
        setRateLimited(true)
        // Clear after 2 seconds
        setTimeout(() => setRateLimited(false), 2000)
      }
    }
    socket.on('error', handleRateLimit)

    // Handle resize - notify server of new dimensions (debounced to avoid flooding)
    const handleResize = debounce(() => {
      fitAddon.fit()
      const { cols, rows } = terminal
      sendTerminalResize(sessionId, paneId, cols, rows)
    }, 200)
    window.addEventListener('resize', handleResize)

    // Send initial dimensions after terminal is ready
    const initialResizeTimeout = setTimeout(() => {
      const { cols, rows } = terminal
      sendTerminalResize(sessionId, paneId, cols, rows)
    }, 100)

    // Cleanup
    return () => {
      clearTimeout(initialResizeTimeout)
      socket.off('tmux:pane:output', handleOutput)
      socket.off('error', handleRateLimit)
      unsubscribeFromTerminal(sessionId, paneId)
      window.removeEventListener('resize', handleResize)
      terminal.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId, paneId])

  // Handle resize when container size changes (debounced)
  const handleContainerResize = useMemo(() => debounce(() => {
    if (fitAddonRef.current && xtermRef.current) {
      fitAddonRef.current.fit()
      const { cols, rows } = xtermRef.current
      sendTerminalResize(sessionId, paneId, cols, rows)
    }
  }, 200), [sessionId, paneId])

  useEffect(() => {
    const resizeObserver = new ResizeObserver(handleContainerResize)
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }
    return () => resizeObserver.disconnect()
  }, [handleContainerResize])

  return (
    <div className="flex flex-col h-full bg-factory-bg border border-factory-border rounded-lg overflow-hidden relative">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-factory-panel border-b border-factory-border">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-signal-green animate-pulse' : 'bg-signal-red'}`} />
          <span className="text-xs text-gray-400">
            {sessionId}:{pane.id} - {pane.command}
          </span>
          {!connected && (
            <span className="text-xs text-signal-red">Disconnected</span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-signal-red transition-colors text-sm"
            aria-label="Close terminal"
          >
            ✕
          </button>
        )}
      </div>

      {/* Rate limit warning */}
      {rateLimited && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-signal-yellow/90 text-black text-xs px-3 py-1 rounded z-10">
          Input rate limited - slow down
        </div>
      )}

      {/* Disconnected overlay */}
      {!connected && (
        <div className="absolute inset-0 top-8 bg-black/70 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="text-signal-red text-lg mb-2">Connection Lost</div>
            <div className="text-gray-400 text-sm">Attempting to reconnect...</div>
          </div>
        </div>
      )}

      {/* Terminal content */}
      <div
        ref={terminalRef}
        className="flex-1 p-1"
        style={{ minHeight: '200px' }}
      />
    </div>
  )
})
