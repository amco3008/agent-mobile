import { ReactNode } from 'react'
import { StatusBar } from './StatusBar'
import { useConnectionStatus } from '../../api/hooks/useSystemStats'

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { connected, error } = useConnectionStatus()

  return (
    <div className="h-screen flex flex-col bg-factory-bg">
      {/* Header */}
      <header className="h-12 border-b border-factory-border flex items-center px-4 gap-4">
        <h1 className="text-lg font-bold text-signal-green">
          RTS Manager
        </h1>
        <span className="text-xs text-gray-500">Agent Control Interface</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
              <span className="text-gray-400">Connected</span>
            </>
          ) : error ? (
            <>
              <span className="w-2 h-2 rounded-full bg-signal-red" />
              <span className="text-signal-red">Error</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-signal-yellow animate-pulse" />
              <span className="text-signal-yellow">Connecting...</span>
            </>
          )}
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {children}
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  )
}
