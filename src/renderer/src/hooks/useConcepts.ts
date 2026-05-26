import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateConceptInput, UpdateConceptInput } from '../../../shared/types'

export function useConcepts(chapterId: string) {
  return useQuery({
    queryKey: ['concepts', chapterId],
    queryFn: () => window.api.concept.list(chapterId),
    enabled: !!chapterId
  })
}

export function useCreateConcept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateConceptInput) => window.api.concept.create(input),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['concepts', vars.chapter_id] })
  })
}

export function useUpdateConcept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateConceptInput }) =>
      window.api.concept.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['concepts'] })
  })
}

export function useDeleteConcept() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => window.api.concept.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['concepts'] })
  })
}
