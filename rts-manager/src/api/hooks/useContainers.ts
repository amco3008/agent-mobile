import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import type { Container, ContainerStats, ContainerSession } from '../../types'
import { useSocketStore } from '../../stores/socketStore'
import { toast } from '../../stores/toastStore'

/**
 * Hook for container list that prefers socket-pushed data.
 * Falls back to API polling only when socket data is unavailable.
 */
export function useContainers() {
  const socketContainers = useSocketStore((state) => state.containers)
  const isConnected = useSocketStore((state) => state.connected)

  const query = useQuery<Container[], Error>({
    queryKey: ['containers'],
    queryFn: () => api.get<Container[]>('/containers'),
    // Only poll if socket is disconnected or no data yet
    refetchInterval: isConnected && socketContainers.length > 0 ? false : 10000,
    refetchOnWindowFocus: !isConnected,
  })

  return {
    ...query,
    data: socketContainers.length > 0 ? socketContainers : query.data,
    isLoading: query.isLoading && socketContainers.length === 0,
  }
}

/**
 * Hook for single container stats.
 */
export function useContainerStats(containerId: string) {
  return useQuery<ContainerStats, Error>({
    queryKey: ['container-stats', containerId],
    queryFn: () => api.get<ContainerStats>(`/containers/${containerId}/stats`),
    refetchInterval: 5000,
    enabled: !!containerId,
  })
}

/**
 * Hook for container actions (start, stop, restart).
 */
export function useContainerActions(containerId: string) {
  const queryClient = useQueryClient()

  const start = useMutation({
    mutationFn: () => api.post(`/containers/${containerId}/start`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] })
      toast.success('Container started successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to start container: ${error.message}`)
    },
  })

  const stop = useMutation({
    mutationFn: () => api.post(`/containers/${containerId}/stop`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] })
      toast.success('Container stopped successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to stop container: ${error.message}`)
    },
  })

  const restart = useMutation({
    mutationFn: () => api.post(`/containers/${containerId}/restart`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] })
      toast.success('Container restarted successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to restart container: ${error.message}`)
    },
  })

  return { start, stop, restart }
}

/**
 * Hook for tmux sessions in a specific container.
 * Used for multi-container session filtering.
 */
export function useContainerSessions(containerId: string | null) {
  return useQuery<{ sessions: ContainerSession[]; message?: string }, Error>({
    queryKey: ['container-sessions', containerId],
    queryFn: () => api.get<{ sessions: ContainerSession[]; message?: string }>(`/containers/${containerId}/sessions`),
    // Poll every 5 seconds when a container is selected
    refetchInterval: containerId ? 5000 : false,
    // Only fetch when a specific container is selected
    enabled: !!containerId,
  })
}
