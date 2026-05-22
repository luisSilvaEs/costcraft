import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateExecutionEntryInput } from '../../../shared/types'

export function useExecutionEntries(conceptId: string) {
  return useQuery({
    queryKey: ['execution', conceptId],
    queryFn: () => window.api.execution.list(conceptId),
    enabled: !!conceptId
  })
}

export function useExecutionSummary(conceptId: string) {
  return useQuery({
    queryKey: ['execution-summary', conceptId],
    queryFn: () => window.api.execution.getProgress(conceptId),
    enabled: !!conceptId
  })
}

export function useAddExecutionEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateExecutionEntryInput) => window.api.execution.addEntry(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['execution', vars.concept_id] })
      qc.invalidateQueries({ queryKey: ['execution-summary', vars.concept_id] })
    }
  })
}

export function useDeleteExecutionEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.execution.deleteEntry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['execution'] })
  })
}
