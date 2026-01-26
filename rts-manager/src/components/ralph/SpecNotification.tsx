import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAutoLaunchRalph } from '../../api/hooks/useRalphLaunch'
import { useSocketStore } from '../../stores/socketStore'
import { useContainers } from '../../api/hooks/useContainers'
import type { PendingSpec } from '../../types'

interface SpecNotificationItemProps {
  spec: PendingSpec
  onDismiss: () => void
  onLaunched: (sessionName: string, containerId: string) => void
}

const SpecNotificationItem = memo(function SpecNotificationItem({
  spec,
  onDismiss,
  onLaunched,
}: SpecNotificationItemProps) {
  const autoLaunch = useAutoLaunchRalph()
  const { data: containers } = useContainers()

  // Find a running container to launch in
  // TODO: In a multi-container setup, might need to determine which container the spec belongs to
  const runningContainer = containers?.find((c) => c.status === 'running')

  const handleLaunch = async () => {
    if (!runningContainer) return

    try {
      const result = await autoLaunch.mutateAsync({
        containerId: runningContainer.id,
        taskId: spec.taskId,
      })

      if (result.success) {
        onLaunched(result.sessionName, result.containerId)
        onDismiss()
      }
    } catch {
      // Error shown by mutation state
    }
  }

  const timeSinceCreation = () => {
    const seconds = Math.floor((Date.now() - spec.createdAt.getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    return `${Math.floor(minutes / 60)}h ago`
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.9 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="bg-factory-panel border border-signal-green/30 rounded-lg shadow-lg overflow-hidden max-w-sm"
    >
      {/* Header */}
      <div className="px-4 py-2 bg-signal-green/10 border-b border-signal-green/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-signal-green text-lg">+</span>
          <span className="text-xs font-bold text-signal-green uppercase tracking-wider">
            Spec Created
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-500 hover:text-gray-300 p-1"
          aria-label="Dismiss notification"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-mono text-gray-200 truncate">
              {spec.taskId}
            </h4>
            {spec.spec.taskSummary && (
              <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                {spec.spec.taskSummary}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
              <span>{spec.spec.maxIterations} iterations</span>
              <span>{spec.spec.mode} mode</span>
              <span>{timeSinceCreation()}</span>
            </div>
          </div>
        </div>

        {/* Error message */}
        {autoLaunch.isError && (
          <div className="mt-3 p-2 bg-signal-red/10 border border-signal-red/30 rounded text-xs text-signal-red">
            {autoLaunch.error?.message || 'Failed to launch'}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Dismiss
          </button>

          {runningContainer ? (
            <motion.button
              type="button"
              onClick={handleLaunch}
              disabled={autoLaunch.isPending}
              className="px-3 py-1.5 bg-signal-green/20 border border-signal-green text-signal-green text-xs rounded hover:bg-signal-green/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {autoLaunch.isPending ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Launching...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Launch Ralph
                </>
              )}
            </motion.button>
          ) : (
            <span className="text-xs text-gray-500">No running container</span>
          )}
        </div>
      </div>
    </motion.div>
  )
})

interface SpecNotificationListProps {
  onLaunched: (sessionName: string, containerId: string) => void
}

export const SpecNotificationList = memo(function SpecNotificationList({
  onLaunched,
}: SpecNotificationListProps) {
  const pendingSpecs = useSocketStore((state) => state.pendingSpecs)
  const removePendingSpec = useSocketStore((state) => state.removePendingSpec)

  if (pendingSpecs.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 space-y-3">
      <AnimatePresence mode="popLayout">
        {pendingSpecs.map((spec) => (
          <SpecNotificationItem
            key={spec.taskId}
            spec={spec}
            onDismiss={() => removePendingSpec(spec.taskId)}
            onLaunched={onLaunched}
          />
        ))}
      </AnimatePresence>
    </div>
  )
})
