import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useRalphLoops } from '../../api/hooks/useRalphLoops'
import { useContainers } from '../../api/hooks/useContainers'
import { useDashboardStore } from '../../stores/dashboardStore'

export const ThroughputStats = memo(function ThroughputStats() {
  const { data: loops } = useRalphLoops()
  const { data: containers } = useContainers()
  const selectedContainerId = useDashboardStore((state) => state.selectedContainerId)

  // Memoize calculated stats
  const { runningLoops, completedLoops, totalIterations, avgIterationsPerLoop } = useMemo(() => {
    const loopsArray = loops ?? []
    const running = loopsArray.filter(l => l.status === 'running').length
    const completed = loopsArray.filter(l => l.status === 'completed').length
    const total = loopsArray.reduce((acc, l) => acc + l.iteration, 0)
    const avg = loopsArray.length ? total / loopsArray.length : 0
    return { runningLoops: running, completedLoops: completed, totalIterations: total, avgIterationsPerLoop: avg }
  }, [loops])

  // Container stats
  const containerStats = useMemo(() => {
    const containersArray = containers ?? []
    const running = containersArray.filter(c => c.status === 'running').length
    const total = containersArray.length
    return { runningContainers: running, totalContainers: total }
  }, [containers])

  const stats = useMemo(() => [
    { label: 'Active Loops', value: runningLoops, color: 'text-signal-green' },
    { label: 'Completed', value: completedLoops, color: 'text-signal-blue' },
    { label: 'Total Iterations', value: totalIterations, color: 'text-signal-yellow' },
    { label: 'Avg/Loop', value: avgIterationsPerLoop.toFixed(1), color: 'text-ore-copper' },
  ], [runningLoops, completedLoops, totalIterations, avgIterationsPerLoop])

  return (
    <div className="factory-panel p-3">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        Throughput
      </h4>

      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="text-center"
          >
            <div className={`text-lg font-bold ${stat.color}`}>
              {stat.value}
            </div>
            <div className="text-[10px] text-gray-500">
              {stat.label}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Container stats section */}
      {containerStats.totalContainers > 0 && (
        <div className="mt-3 pt-3 border-t border-factory-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Containers</span>
            <span className="font-mono">
              <span className={containerStats.runningContainers > 0 ? 'text-signal-green' : 'text-gray-500'}>
                {containerStats.runningContainers}
              </span>
              <span className="text-gray-600">/{containerStats.totalContainers}</span>
            </span>
          </div>
          {selectedContainerId && containers && (
            <div className="mt-1 text-[10px] text-gray-500 truncate">
              Filtered: {containers.find(c => c.id === selectedContainerId)?.name || 'Unknown'}
            </div>
          )}
        </div>
      )}

      {/* Activity indicator */}
      {runningLoops > 0 && (
        <div className="mt-3 flex items-center justify-center gap-1">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-signal-green"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-[10px] text-signal-green">
            Processing...
          </span>
        </div>
      )}
    </div>
  )
})
