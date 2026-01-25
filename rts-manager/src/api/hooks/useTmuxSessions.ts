import { useQuery } from '@tanstack/react-query'
import { api } from '../client'
import { TmuxSession } from '../../types'

export function useTmuxSessions() {
  return useQuery<TmuxSession[], Error>({
    queryKey: ['tmux', 'sessions'],
    queryFn: () => api.get<TmuxSession[]>('/tmux/sessions'),
    refetchInterval: 5000, // Refresh every 5 seconds
  })
}

export function useTmuxSession(sessionId: string | null) {
  return useQuery<TmuxSession, Error>({
    queryKey: ['tmux', 'sessions', sessionId],
    queryFn: () => api.get<TmuxSession>(`/tmux/sessions/${sessionId}`),
    enabled: !!sessionId,
    refetchInterval: 2000, // More frequent for active session
  })
}
