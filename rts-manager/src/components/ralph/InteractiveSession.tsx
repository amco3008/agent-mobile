import { useEffect, useRef, useMemo, memo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { getSocket, subscribeToTerminal, unsubscribeFromTerminal, sendTerminalInput, sendTerminalResize } from '../../api/socket'
import { useKillRalphSession } from '../../api/hooks/useRalphLaunch'
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

interface InteractiveSessionProps {
  sessionName: string
  containerId: string
  containerName?: string
  command?: string
  onClose: () => void
}

export const InteractiveSession = memo(function InteractiveSession({
  sessionName,
  containerId,
  containerName,
  command = 'claude',
  onClose,
}: InteractiveSessionProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const killSession = useKillRalphSession()
  const [confirmKill, setConfirmKill] = useState(false)

  // For socket subscription, we use the session name as sessionId and "0" as paneId
  // since we created a single-pane tmux session
  const paneId = '0'

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
      theme: {
        background: '#0d0d0d',
        foreground: '#e0e0e0',
        cursor: '#00ff00',
        cursorAccent: '#0d0d0d',
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
    subscribeToTerminal(sessionName, paneId)

    // Handle incoming data
    const handleOutput = (data: { sessionId: string; paneId: string; data: string }) => {
      if (data.sessionId === sessionName && data.paneId === paneId) {
        terminal.write(data.data)
      }
    }
    socket.on('tmux:pane:output', handleOutput)

    // Handle user input
    terminal.onData((data) => {
      sendTerminalInput(sessionName, paneId, data)
    })

    // Handle resize - notify server of new dimensions (debounced)
    const handleResize = debounce(() => {
      fitAddon.fit()
      const { cols, rows } = terminal
      sendTerminalResize(sessionName, paneId, cols, rows)
    }, 200)
    window.addEventListener('resize', handleResize)

    // Send initial dimensions
    setTimeout(() => {
      fitAddon.fit()
      const { cols, rows } = terminal
      sendTerminalResize(sessionName, paneId, cols, rows)
    }, 100)

    // Focus terminal
    terminal.focus()

    // Cleanup
    return () => {
      socket.off('tmux:pane:output', handleOutput)
      unsubscribeFromTerminal(sessionName, paneId)
      window.removeEventListener('resize', handleResize)
      terminal.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionName, paneId])

  // Handle resize when container size changes
  const handleContainerResize = useMemo(
    () =>
      debounce(() => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit()
          const { cols, rows } = xtermRef.current
          sendTerminalResize(sessionName, paneId, cols, rows)
        }
      }, 200),
    [sessionName, paneId]
  )

  useEffect(() => {
    const resizeObserver = new ResizeObserver(handleContainerResize)
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }
    return () => resizeObserver.disconnect()
  }, [handleContainerResize])

  // Handle close with option to kill session
  const handleClose = () => {
    onClose()
  }

  const handleKillAndClose = async () => {
    try {
      await killSession.mutateAsync({ containerId, sessionName })
    } catch {
      // Session might already be dead
    }
    onClose()
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-[#0d0d0d] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-factory-panel border-b border-factory-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
              <span className="text-sm font-mono text-gray-200">{sessionName}</span>
            </div>
            <span className="text-xs text-gray-500">|</span>
            <span className="text-xs text-gray-400">
              {containerName || containerId.slice(0, 12)}
            </span>
            <span className="text-xs text-gray-500">|</span>
            <span className="text-xs text-gray-500">{command}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600 mr-4">
              Press Ctrl+D or type 'exit' to end session
            </span>
            <motion.button
              type="button"
              onClick={handleClose}
              className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 border border-transparent hover:border-factory-border rounded transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Minimize
            </motion.button>
            {confirmKill ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-signal-yellow">Kill session?</span>
                <motion.button
                  type="button"
                  onClick={handleKillAndClose}
                  className="px-2 py-1 text-xs bg-signal-red/20 text-signal-red border border-signal-red/30 rounded hover:bg-signal-red/30 transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  aria-label="Confirm kill session"
                >
                  Yes
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setConfirmKill(false)}
                  className="px-2 py-1 text-xs text-gray-400 border border-factory-border rounded hover:bg-factory-highlight transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  aria-label="Cancel kill"
                >
                  No
                </motion.button>
              </div>
            ) : (
              <motion.button
                type="button"
                onClick={() => setConfirmKill(true)}
                className="px-3 py-1 text-xs text-signal-red/70 hover:text-signal-red border border-transparent hover:border-signal-red/30 rounded transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Kill Session
              </motion.button>
            )}
          </div>
        </div>

        {/* Terminal */}
        <div ref={terminalRef} className="flex-1 p-2" />

        {/* Footer hint */}
        <div className="px-4 py-1.5 bg-factory-panel border-t border-factory-border flex items-center justify-between text-[10px] text-gray-600">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1 py-0.5 bg-factory-bg rounded text-gray-500">Ctrl+C</kbd> interrupt
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-factory-bg rounded text-gray-500">/ralph-invoke</kbd> to create spec
            </span>
          </div>
          <div>
            When Claude outputs{' '}
            <code className="text-signal-green">ralph &lt;task-id&gt;</code>, run it to start the loop
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
})
