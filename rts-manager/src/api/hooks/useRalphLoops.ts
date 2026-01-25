import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../client'
import { RalphLoop } from '../../types'

export function useRalphLoops() {
  return useQuery<RalphLoop[], Error>({
    queryKey: ['ralph', 'loops'],
    queryFn: () => api.get<RalphLoop[]>('/ralph/loops'),
    refetchInterval: 3000, // Check for updates frequently
  })
}

export function useRalphLoop(taskId: string | null) {
  return useQuery<RalphLoop, Error>({
    queryKey: ['ralph', 'loops', taskId],
    queryFn: () => api.get<RalphLoop>(`/ralph/loops/${taskId}`),
    enabled: !!taskId,
    refetchInterval: 2000,
  })
}

export function useSteerRalphLoop() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ taskId, response }: { taskId: string; response: string }) =>
      api.post(`/ralph/loops/${taskId}/steer`, { response }),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['ralph', 'loops', taskId] })
      queryClient.invalidateQueries({ queryKey: ['ralph', 'loops'] })
    },
  })
}
