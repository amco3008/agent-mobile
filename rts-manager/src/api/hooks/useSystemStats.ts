import { useQuery } from '@tanstack/react-query'
import { api } from '../client'
import { SystemStats } from '../../types'

export function useSystemStats() {
  return useQuery<SystemStats, Error>({
    queryKey: ['system', 'stats'],
    queryFn: () => api.get<SystemStats>('/system/stats'),
    refetchInterval: 5000, // Update every 5 seconds
  })
}
