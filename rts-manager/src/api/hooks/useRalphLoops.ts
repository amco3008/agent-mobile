import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import { RalphLoop } from '../../types'
import { useSocketStore } from '../../stores/socketStore'

/**
 * Hook for Ralph loops that prefers socket-pushed data.
 * Falls back to API polling only when socket data is unavailable.
 */
export function useRalphLoops() {
  const socketLoops = useSocketStore((state) => state.getRalphLoopsArray())
  const isConnected = useSocketStore((state) => state.connected)

  const query = useQuery<RalphLoop[], Error>({
    queryKey: ['ralph', 'loops'],
    queryFn: () => api.get<RalphLoop[]>('/ralph/loops'),
    // Only poll if socket is disconnected or no data yet
    refetchInterval: isConnected && socketLoops.length > 0 ? false : 3000,
    refetchOnWindowFocus: !isConnected,
  })

  return {
    ...query,
    data: socketLoops.length > 0 ? socketLoops : query.data,
    isLoading: query.isLoading && socketLoops.length === 0,
  }
}

export function useRalphLoop(taskId: string | null) {
  const ralphLoops = useSocketStore((state) => state.ralphLoops)
  const isConnected = useSocketStore((state) => state.connected)

  // Find loop in socket data
  const socketLoop = taskId ? ralphLoops.get(taskId) : undefined

  const query = useQuery<RalphLoop, Error>({
    queryKey: ['ralph', 'loops', taskId],
    queryFn: () => api.get<RalphLoop>(`/ralph/loops/${taskId}`),
    enabled: !!taskId && !socketLoop,
    refetchInterval: socketLoop ? false : 2000,
  })

  return {
    ...query,
    data: socketLoop ?? query.data,
    isLoading: query.isLoading && !socketLoop,
  }
}

/**
 * Hook to get Ralph progress content for a specific task.
 * Uses socket-pushed data which updates in real-time.
 */
export function useRalphProgress(taskId: string | null) {
  const progress = useSocketStore((state) =>
    taskId ? state.ralphProgress.get(taskId) : undefined
  )

  return {
    data: progress,
    isLoading: false, // Socket data is always "loaded" (may just be undefined)
  }
}

/**
 * Hook to get Ralph steering status for a specific task.
 * Uses socket-pushed data which updates in real-time.
 */
export function useRalphSteering(taskId: string | null) {
  const steering = useSocketStore((state) =>
    taskId ? state.ralphSteering.get(taskId) : undefined
  )

  return {
    data: steering,
    isLoading: false,
  }
}

/**
 * Hook to get Ralph summary for a specific task.
 * Uses socket-pushed data.
 */
export function useRalphSummary(taskId: string | null) {
  const summary = useSocketStore((state) =>
    taskId ? state.ralphSummaries.get(taskId) : undefined
  )

  return {
    data: summary,
    isLoading: false,
  }
}

export function useSteerRalphLoop() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ taskId, response }: { taskId: string; response: string }) =>
      api.post(`/ralph/loops/${taskId}/steer`, { response }),
    onSuccess: (_, { taskId }) => {
      // Invalidate queries for fallback data
      queryClient.invalidateQueries({ queryKey: ['ralph', 'loops', taskId] })
      queryClient.invalidateQueries({ queryKey: ['ralph', 'loops'] })
      // Socket will push the updated steering status automatically
    },
  })
}
