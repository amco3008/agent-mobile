import { useState, memo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useContainers } from '../../api/hooks/useContainers'
import { useLaunchClaudeSession, type LaunchConfig } from '../../api/hooks/useRalphLaunch'
import { toast } from '../../stores/toastStore'
import { useEscapeKey, useFocusTrap } from '../../hooks/useModal'

interface LaunchModalProps {
  isOpen: boolean
  onClose: () => void
  onLaunched: (sessionName: string, containerId: string) => void
}

export const LaunchModal = memo(function LaunchModal({
  isOpen,
  onClose,
  onLaunched,
}: LaunchModalProps) {
  const { data: containers } = useContainers()
  const launchMutation = useLaunchClaudeSession()

  const [selectedContainer, setSelectedContainer] = useState<string>('')
  const [workingDir, setWorkingDir] = useState<string>('')
  const [command, setCommand] = useState<LaunchConfig['command']>('claude')

  // Accessibility: Escape key and focus trap
  useEscapeKey(onClose, isOpen)
  const { containerRef, handleKeyDown } = useFocusTrap<HTMLDivElement>(isOpen)

  // Filter to only running containers
  const runningContainers = containers?.filter((c) => c.status === 'running') || []

  // Auto-select first running container
  useEffect(() => {
    if (isOpen && runningContainers.length > 0 && !selectedContainer) {
      setSelectedContainer(runningContainers[0].id)
    }
  }, [isOpen, runningContainers, selectedContainer])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setWorkingDir('')
      setCommand('claude')
      launchMutation.reset()
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (!selectedContainer) return

    try {
      const result = await launchMutation.mutateAsync({
        containerId: selectedContainer,
        workingDir: workingDir.trim() || undefined,
        command,
      })

      if (result.success) {
        onLaunched(result.sessionName, result.containerId)
        onClose()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to launch session')
    }
  }

  const selectedContainerName = runningContainers.find(
    (c) => c.id === selectedContainer
  )?.name

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[90vw] bg-factory-panel border border-factory-border rounded-lg shadow-xl z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-modal-title"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="border-b border-factory-border p-4 flex items-center justify-between">
          <div>
            <h2 id="launch-modal-title" className="text-sm font-bold text-gray-200">Start New Ralph Session</h2>
            <p className="text-xs text-gray-500 mt-1">
              Launch Claude Code to create a ralph spec interactively
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 p-1"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Container selector */}
          <div>
            <label htmlFor="container-select" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Container
            </label>
            {runningContainers.length === 0 ? (
              <div className="p-3 bg-factory-bg rounded border border-factory-border text-xs text-gray-500">
                No running containers found. Start an agent-mobile container first.
              </div>
            ) : (
              <select
                id="container-select"
                value={selectedContainer}
                onChange={(e) => setSelectedContainer(e.target.value)}
                className="w-full p-2 bg-factory-bg border border-factory-border rounded text-sm text-gray-200 focus:border-signal-yellow focus:outline-none"
              >
                {runningContainers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id.slice(0, 12)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Working directory input */}
          <div>
            <label htmlFor="working-dir" className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Working Directory <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <input
              id="working-dir"
              type="text"
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder="~/projects/myproject"
              className="w-full p-2 bg-factory-bg border border-factory-border rounded text-sm font-mono text-gray-200 placeholder-gray-600 focus:border-signal-yellow focus:outline-none"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Leave empty to use the container's default directory
            </p>
          </div>

          {/* Command selector */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              Initial Command
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="command"
                  value="claude"
                  checked={command === 'claude'}
                  onChange={() => setCommand('claude')}
                  className="accent-signal-yellow"
                />
                <span className="text-sm text-gray-200">claude</span>
                <span className="text-xs text-gray-500">- Start Claude Code for interactive planning</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="command"
                  value="claude /ralph-invoke"
                  checked={command === 'claude /ralph-invoke'}
                  onChange={() => setCommand('claude /ralph-invoke')}
                  className="accent-signal-yellow"
                />
                <span className="text-sm text-gray-200">claude /ralph-invoke</span>
                <span className="text-xs text-gray-500">- Jump directly to ralph-invoke</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="command"
                  value="bash"
                  checked={command === 'bash'}
                  onChange={() => setCommand('bash')}
                  className="accent-signal-yellow"
                />
                <span className="text-sm text-gray-200">bash</span>
                <span className="text-xs text-gray-500">- Plain shell (advanced)</span>
              </label>
            </div>
          </div>

          {/* Error message */}
          {launchMutation.isError && (
            <div className="p-3 bg-signal-red/10 border border-signal-red/30 rounded text-xs text-signal-red">
              {launchMutation.error?.message || 'Failed to launch session'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-factory-border p-4 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {selectedContainerName && (
              <>Target: <span className="text-gray-400">{selectedContainerName}</span></>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <motion.button
              type="button"
              onClick={handleSubmit}
              disabled={!selectedContainer || launchMutation.isPending}
              className="px-4 py-2 bg-signal-yellow/20 border border-signal-yellow text-signal-yellow text-xs rounded hover:bg-signal-yellow/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {launchMutation.isPending ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Launching...
                </>
              ) : (
                <>
                  Start Claude
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
})
