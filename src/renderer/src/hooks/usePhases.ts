import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreatePhaseInput, UpdatePhaseInput } from '../../../shared/types'

export function usePhases() {
  return useQuery({
    queryKey: ['phases'],
    queryFn: () => window.api.phase.list()
  })
}

export function useCreatePhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePhaseInput) => window.api.phase.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['phases'] })
  })
}

export function useUpdatePhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePhaseInput }) =>
      window.api.phase.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['phases'] })
  })
}

export function useDeletePhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.phase.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['phases'] })
  })
}
