import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToastStore, type Toast as ToastType } from '../../stores/toastStore'

const toastStyles: Record<ToastType['type'], string> = {
  success: 'bg-signal-green/20 border-signal-green/50 text-signal-green',
  error: 'bg-signal-red/20 border-signal-red/50 text-signal-red',
  info: 'bg-signal-blue/20 border-signal-blue/50 text-signal-blue',
}

const toastIcons: Record<ToastType['type'], string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
}

export const ToastContainer = memo(function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)
  const removeToast = useToastStore((state) => state.removeToast)

  return (
    <div className="fixed bottom-20 right-4 z-50 space-y-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border shadow-lg ${toastStyles[toast.type]}`}
          >
            <span className="text-lg">{toastIcons[toast.type]}</span>
            <span className="text-sm">{toast.message}</span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
})
