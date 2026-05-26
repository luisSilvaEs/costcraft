//src/renderer/src/hooks/useProject.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { UpdateProjectInput } from '../../../shared/types'

export function useProject() {
  return useQuery({
    queryKey: ['project'],
    queryFn: () => window.api.project.getInfo()
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateProjectInput) => window.api.project.updateInfo(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project'] })
  })
}
