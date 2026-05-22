import { create } from 'zustand'

interface AppState {
  // Navegación
  selectedPhaseId: string | null
  selectedChapterId: string | null
  selectedConceptId: string | null

  // Acciones
  selectPhase: (id: string | null) => void
  selectChapter: (id: string | null) => void
  selectConcept: (id: string | null) => void
  clearSelection: () => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedPhaseId: null,
  selectedChapterId: null,
  selectedConceptId: null,

  selectPhase: (id) =>
    set({ selectedPhaseId: id, selectedChapterId: null, selectedConceptId: null }),

  selectChapter: (id) => set({ selectedChapterId: id, selectedConceptId: null }),

  selectConcept: (id) => set({ selectedConceptId: id }),

  clearSelection: () =>
    set({ selectedPhaseId: null, selectedChapterId: null, selectedConceptId: null })
}))
