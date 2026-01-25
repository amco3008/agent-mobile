import { ReactNode } from 'react'
import { StatusBar } from './StatusBar'

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
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
          <span className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
          <span className="text-gray-400">Connected</span>
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
