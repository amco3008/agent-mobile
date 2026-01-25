import { useState, memo } from 'react'
import { motion } from 'framer-motion'
import { useSteerRalphLoop } from '../../api/hooks/useRalphLoops'
import { useSocketStore } from '../../stores/socketStore'
import type { RalphLoop } from '../../types'

interface SteeringPanelProps {
  loop: RalphLoop
}

export const SteeringPanel = memo(function SteeringPanel({ loop }: SteeringPanelProps) {
  const [response, setResponse] = useState('')
  const steerMutation = useSteerRalphLoop()
  const steering = useSocketStore((state) => state.ralphSteering.get(loop.taskId))

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

  const handleOptionClick = (option: string) => {
    setResponse(option)
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
        {steering?.iteration && (
          <span className="text-xs text-gray-500">
            (Iteration {steering.iteration})
          </span>
        )}
      </div>

      {/* Question */}
      {steering?.question && (
        <div className="mb-3">
          <h4 className="text-xs font-bold text-signal-yellow mb-1">Question</h4>
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{steering.question}</p>
        </div>
      )}

      {/* Context */}
      {steering?.context && (
        <div className="mb-3">
          <h4 className="text-xs font-bold text-gray-400 mb-1">Context</h4>
          <p className="text-xs text-gray-400 whitespace-pre-wrap">{steering.context}</p>
        </div>
      )}

      {/* Options */}
      {steering?.options && steering.options.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-bold text-gray-400 mb-1">Options</h4>
          <ul className="space-y-1">
            {steering.options.map((opt, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => handleOptionClick(opt)}
                  className="text-left text-xs text-gray-300 hover:text-signal-yellow cursor-pointer transition-colors w-full p-1.5 rounded hover:bg-factory-highlight"
                >
                  {i + 1}. {opt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fallback message if no steering data */}
      {!steering && (
        <div className="text-xs text-gray-400 mb-3">
          Ralph loop <span className="text-signal-green">{loop.taskId}</span> is
          waiting for your input to continue.
        </div>
      )}

      <textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Enter your response or guidance..."
        className="w-full h-24 p-2 bg-factory-bg border border-factory-border rounded text-sm font-mono text-gray-200 resize-none focus:border-signal-yellow focus:outline-none"
        aria-label="Steering response"
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
})
