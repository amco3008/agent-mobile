import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import type { RalphLoop } from '../../types'

interface ProductionChainProps {
  loop: RalphLoop
}

export const ProductionChain = memo(function ProductionChain({ loop }: ProductionChainProps) {
  const progress = useMemo(() =>
    loop.maxIterations > 0 ? (loop.iteration / loop.maxIterations) * 100 : 50,
    [loop.iteration, loop.maxIterations]
  )

  return (
    <div className="factory-panel p-4">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
        Production Chain: {loop.taskId}
      </h3>

      <div className="flex items-center justify-between gap-2">
        {/* Input Node */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex-shrink-0"
        >
          <div className="w-20 h-20 rounded-lg bg-factory-bg border-2 border-ore-iron flex flex-col items-center justify-center">
            <div className="text-2xl mb-1">📝</div>
            <div className="text-[10px] text-gray-400">Prompt</div>
          </div>
        </motion.div>

        {/* Conveyor Belt */}
        <div className="flex-1 relative h-4">
          <div className="absolute inset-0 bg-factory-bg border border-factory-border rounded">
            <motion.div
              className="h-full belt-progress rounded"
              style={{ width: `${progress}%` }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          {/* Items on belt */}
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 text-sm"
            animate={{
              left: ['0%', '100%'],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear',
            }}
          >
            📦
          </motion.div>
        </div>

        {/* Processing Node */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex-shrink-0"
        >
          <div className={`w-24 h-20 rounded-lg bg-factory-bg border-2 flex flex-col items-center justify-center ${
            loop.status === 'running' ? 'border-signal-green' : 'border-factory-border'
          }`}>
            <motion.div
              animate={loop.status === 'running' ? { rotate: 360 } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="text-2xl mb-1"
            >
              ⚙️
            </motion.div>
            <div className="text-[10px] text-gray-400">Claude</div>
            <div className={`text-[10px] ${
              loop.status === 'running' ? 'text-signal-green' : 'text-gray-500'
            }`}>
              {loop.status === 'running' ? 'Processing...' : loop.status}
            </div>
          </div>
        </motion.div>

        {/* Output Conveyor */}
        <div className="flex-1 relative h-4">
          <div className="absolute inset-0 bg-factory-bg border border-factory-border rounded">
            {loop.status === 'completed' && (
              <div className="h-full bg-signal-green/30 rounded" />
            )}
          </div>
        </div>

        {/* Output Node */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex-shrink-0"
        >
          <div className={`w-20 h-20 rounded-lg bg-factory-bg border-2 flex flex-col items-center justify-center ${
            loop.status === 'completed' ? 'border-signal-green' : 'border-factory-border'
          }`}>
            <div className="text-2xl mb-1">📦</div>
            <div className="text-[10px] text-gray-400">Output</div>
          </div>
        </motion.div>
      </div>

      {/* Stats row */}
      <div className="mt-4 flex justify-between text-xs text-gray-500">
        <span>Iteration: {loop.iteration}/{loop.maxIterations || '∞'}</span>
        <span>Mode: {loop.mode}</span>
        <span>Started: {new Date(loop.startedAt).toLocaleTimeString()}</span>
      </div>

      {/* Steering indicator */}
      {loop.steeringStatus === 'pending' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 p-2 bg-signal-yellow/10 border border-signal-yellow/30 rounded text-xs text-signal-yellow"
        >
          Awaiting user input - check steering panel
        </motion.div>
      )}
    </div>
  )
})
