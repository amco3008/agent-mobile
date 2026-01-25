import { useSystemStats } from '../../api/hooks/useSystemStats'

export function ResourceMonitor() {
  const { data: stats, isLoading } = useSystemStats()

  if (isLoading || !stats) {
    return (
      <div className="factory-panel p-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
          System Resources
        </h3>
        <div className="text-signal-yellow animate-pulse text-sm">
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* CPU */}
      <div className="factory-panel p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">CPU</span>
          <span className="text-sm font-bold text-signal-yellow">
            {stats.cpu.usage.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 bg-factory-bg rounded overflow-hidden">
          <div
            className="h-full bg-signal-yellow transition-all duration-500"
            style={{ width: `${stats.cpu.usage}%` }}
          />
        </div>
        <div className="text-[10px] text-gray-500 mt-1">
          {stats.cpu.cores} cores
        </div>
      </div>

      {/* Memory */}
      <div className="factory-panel p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">Memory</span>
          <span className="text-sm font-bold text-ore-copper">
            {stats.memory.percent.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 bg-factory-bg rounded overflow-hidden">
          <div
            className="h-full bg-ore-copper transition-all duration-500"
            style={{ width: `${stats.memory.percent}%` }}
          />
        </div>
        <div className="text-[10px] text-gray-500 mt-1">
          {formatBytes(stats.memory.used)} / {formatBytes(stats.memory.total)}
        </div>
      </div>

      {/* Uptime */}
      <div className="factory-panel p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Uptime</span>
          <span className="text-sm font-bold text-signal-green">
            {formatUptime(stats.uptime)}
          </span>
        </div>
      </div>

      {/* Claude Processes */}
      <div className="factory-panel p-3">
        <h4 className="text-xs text-gray-400 mb-2">Claude Processes</h4>
        {stats.claudeProcesses.length === 0 ? (
          <div className="text-xs text-gray-500 italic">
            No active processes
          </div>
        ) : (
          <div className="space-y-1">
            {stats.claudeProcesses.map((proc, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-gray-300 truncate flex-1">
                  {proc.name}
                </span>
                <span className="text-signal-green ml-2">
                  {proc.cpu.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)}GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(0)}MB`
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
