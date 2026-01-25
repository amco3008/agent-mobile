import { motion } from 'framer-motion'
import { useRalphLoops } from '../../api/hooks/useRalphLoops'

export function ThroughputStats() {
  const { data: loops } = useRalphLoops()

  // Calculate stats
  const runningLoops = loops?.filter(l => l.status === 'running').length || 0
  const completedLoops = loops?.filter(l => l.status === 'completed').length || 0
  const totalIterations = loops?.reduce((acc, l) => acc + l.iteration, 0) || 0

  // Estimate iterations per hour (simplified)
  const avgIterationsPerLoop = loops?.length ? totalIterations / loops.length : 0

  const stats = [
    { label: 'Active Loops', value: runningLoops, color: 'text-signal-green' },
    { label: 'Completed', value: completedLoops, color: 'text-signal-blue' },
    { label: 'Total Iterations', value: totalIterations, color: 'text-signal-yellow' },
    { label: 'Avg/Loop', value: avgIterationsPerLoop.toFixed(1), color: 'text-ore-copper' },
  ]

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
}
