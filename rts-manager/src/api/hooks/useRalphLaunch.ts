import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'

export interface LaunchConfig {
  containerId: string
  workingDir?: string
  command?: 'claude' | 'claude /ralph-invoke' | 'bash'
}

export interface LaunchResult {
  success: boolean
  sessionName: string
  containerId: string
  containerName: string
  command: string
  workingDir: string | null
  message: string
}

export interface RalphSession {
  containerId: string
  sessions: string[]
  count: number
}

/**
 * Hook for launching a new Claude session in a container
 */
export function useLaunchClaudeSession() {
  const queryClient = useQueryClient()

  return useMutation<LaunchResult, Error, LaunchConfig>({
    mutationFn: async (config) => {
      return api.post<LaunchResult>('/ralph/launch', config)
    },
    onSuccess: () => {
      // Invalidate tmux sessions to pick up the new session
      queryClient.invalidateQueries({ queryKey: ['tmux-sessions'] })
    },
  })
}

/**
 * Hook for auto-launching ralph for an existing spec
 */
export function useAutoLaunchRalph() {
  const queryClient = useQueryClient()

  return useMutation<LaunchResult, Error, { containerId: string; taskId: string }>({
    mutationFn: async ({ containerId, taskId }) => {
      return api.post<LaunchResult>('/ralph/auto-launch', { containerId, taskId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tmux-sessions'] })
    },
  })
}

/**
 * Hook for listing ralph sessions in a container
 */
export function useRalphSessions(_containerId: string | null) {
  // This would use useQuery but for now we'll just return the mutation
  // Sessions are typically discovered via socket updates
  return null
}

/**
 * Hook for killing a ralph session
 */
export function useKillRalphSession() {
  const queryClient = useQueryClient()

  return useMutation<{ success: boolean; message: string }, Error, { containerId: string; sessionName: string }>({
    mutationFn: async ({ containerId, sessionName }) => {
      return api.delete<{ success: boolean; message: string }>(`/ralph/sessions/${containerId}/${sessionName}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tmux-sessions'] })
    },
  })
}
