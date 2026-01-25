import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSteerRalphLoop } from '../../api/hooks/useRalphLoops'
import type { RalphLoop } from '../../types'

interface SteeringPanelProps {
  loop: RalphLoop
}

export function SteeringPanel({ loop }: SteeringPanelProps) {
  const [response, setResponse] = useState('')
  const steerMutation = useSteerRalphLoop()

  if (loop.steeringStatus !== 'pending') {
    return null
  }

  const handleSubmit = () => {
    if (!response.trim()) return

    steerMutation.mutate(
      { taskId: loop.taskId, response: response.trim() },
      {
        onSuccess: () => setResponse(''),
      }
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="factory-panel p-4 border-signal-yellow/50"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-signal-yellow text-lg">⚠️</span>
        <h3 className="text-sm font-bold text-signal-yellow">
          Steering Required
        </h3>
      </div>

      <div className="text-xs text-gray-400 mb-3">
        Ralph loop <span className="text-signal-green">{loop.taskId}</span> is
        waiting for your input to continue.
      </div>

      <textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Enter your response or guidance..."
        className="w-full h-24 p-2 bg-factory-bg border border-factory-border rounded text-sm font-mono text-gray-200 resize-none focus:border-signal-yellow focus:outline-none"
      />

      <div className="flex justify-end gap-2 mt-3">
        <motion.button
          onClick={handleSubmit}
          disabled={!response.trim() || steerMutation.isPending}
          className="px-4 py-1.5 bg-signal-yellow/20 border border-signal-yellow text-signal-yellow text-xs rounded hover:bg-signal-yellow/30 disabled:opacity-50 disabled:cursor-not-allowed"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {steerMutation.isPending ? 'Sending...' : 'Send Response'}
        </motion.button>
      </div>
    </motion.div>
  )
}
