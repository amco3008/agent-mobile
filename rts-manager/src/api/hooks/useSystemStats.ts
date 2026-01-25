import { useQuery } from '@tanstack/react-query'
import { api } from '../client'
import { SystemStats } from '../../types'
import { useSocketStore } from '../../stores/socketStore'

/**
 * Hook for system stats that prefers socket-pushed data.
 * Falls back to API polling only when socket data is unavailable.
 */
export function useSystemStats() {
  const socketStats = useSocketStore((state) => state.systemStats)
  const isConnected = useSocketStore((state) => state.connected)

  const query = useQuery<SystemStats, Error>({
    queryKey: ['system', 'stats'],
    queryFn: () => api.get<SystemStats>('/system/stats'),
    // Only poll if socket is disconnected or no data yet
    refetchInterval: isConnected && socketStats ? false : 5000,
    refetchOnWindowFocus: !isConnected,
  })

  return {
    ...query,
    data: socketStats ?? query.data,
    isLoading: query.isLoading && !socketStats,
  }
}

/**
 * Hook to get connection status from the socket store.
 */
export function useConnectionStatus() {
  const connected = useSocketStore((state) => state.connected)
  const error = useSocketStore((state) => state.connectionError)

  return {
    connected,
    error,
  }
}
