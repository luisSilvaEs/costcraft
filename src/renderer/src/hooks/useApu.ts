import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateApuComponentInput, UpdateApuComponentInput } from '../../../shared/types'

export function useApuComponents(conceptId: string) {
  return useQuery({
    queryKey: ['apu', conceptId],
    queryFn: () => window.api.apu.listComponents(conceptId),
    enabled: !!conceptId
  })
}

export function useApuSummary(conceptId: string) {
  return useQuery({
    queryKey: ['apu-summary', conceptId],
    queryFn: () => window.api.apu.getSummary(conceptId),
    enabled: !!conceptId
  })
}

export function useCreateApuComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateApuComponentInput) => window.api.apu.addComponent(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['apu', vars.concept_id] })
      qc.invalidateQueries({ queryKey: ['apu-summary', vars.concept_id] })
    }
  })
}

export function useUpdateApuComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateApuComponentInput }) =>
      window.api.apu.updateComponent(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apu'] })
      qc.invalidateQueries({ queryKey: ['apu-summary'] })
    }
  })
}

export function useDeleteApuComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.apu.deleteComponent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apu'] })
      qc.invalidateQueries({ queryKey: ['apu-summary'] })
    }
  })
}
