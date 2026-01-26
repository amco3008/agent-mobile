import { useQuery } from '@tanstack/react-query'
import { api } from '../client'
import { TmuxSession } from '../../types'
import { useSocketStore } from '../../stores/socketStore'

/**
 * Hook for tmux sessions that prefers socket-pushed data.
 * Falls back to API polling only when socket data is unavailable.
 */
export function useTmuxSessions() {
  const socketSessions = useSocketStore((state) => state.tmuxSessions)
  const isConnected = useSocketStore((state) => state.connected)

  // Use API query as fallback, but don't poll if socket is connected and has data
  const query = useQuery<TmuxSession[], Error>({
    queryKey: ['tmux', 'sessions'],
    queryFn: () => api.get<TmuxSession[]>('/tmux/sessions'),
    // Only poll if socket is disconnected or no data yet
    refetchInterval: isConnected && socketSessions.length > 0 ? false : 5000,
    // Don't refetch on window focus if we have socket data
    refetchOnWindowFocus: !isConnected,
  })

  // Prefer socket data if available, otherwise use query data
  return {
    ...query,
    data: socketSessions.length > 0 ? socketSessions : query.data,
    // Consider loading only if both socket and query have no data
    isLoading: query.isLoading && socketSessions.length === 0,
  }
}

export function useTmuxSession(sessionId: string | null) {
  const socketSessions = useSocketStore((state) => state.tmuxSessions)

  // Find session in socket data
  const socketSession = sessionId
    ? socketSessions.find((s) => s.id === sessionId || s.name === sessionId)
    : undefined

  const query = useQuery<TmuxSession, Error>({
    queryKey: ['tmux', 'sessions', sessionId],
    queryFn: () => api.get<TmuxSession>(`/tmux/sessions/${sessionId}`),
    enabled: !!sessionId && !socketSession,
    // Only poll if socket session not found
    refetchInterval: socketSession ? false : 2000,
  })

  return {
    ...query,
    data: socketSession ?? query.data,
    isLoading: query.isLoading && !socketSession,
  }
}
