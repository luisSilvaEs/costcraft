import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateChapterInput, UpdateChapterInput } from '../../../shared/types'

export function useChapters(phaseId: string) {
  return useQuery({
    queryKey: ['chapters', phaseId],
    queryFn: () => window.api.chapter.list(phaseId),
    enabled: !!phaseId
  })
}

export function useCreateChapter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateChapterInput) => window.api.chapter.create(input),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['chapters', vars.phase_id] })
  })
}

export function useUpdateChapter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateChapterInput }) =>
      window.api.chapter.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chapters'] })
  })
}

export function useDeleteChapter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.chapter.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chapters'] })
  })
}
