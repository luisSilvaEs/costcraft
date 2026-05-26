/**
 * budget.handlers.ts
 *
 * IPC handlers para la estructura del presupuesto:
 *   Fases → Capítulos → Conceptos → Componentes APU
 *
 * Canales registrados:
 *
 *   Fases
 *   ─────
 *   phase:create          — crea una fase
 *   phase:list            — lista todas las fases del proyecto
 *   phase:update          — actualiza nombre u orden de una fase
 *   phase:delete          — elimina una fase (y sus capítulos/conceptos en cascada)
 *   phase:reorder         — reordena fases
 *
 *   Capítulos
 *   ─────────
 *   chapter:create        — crea un capítulo en una fase
 *   chapter:list          — lista capítulos de una fase
 *   chapter:update        — actualiza nombre u orden
 *   chapter:delete        — elimina un capítulo
 *   chapter:reorder       — reordena capítulos dentro de una fase
 *
 *   Conceptos
 *   ─────────
 *   concept:create        — crea un concepto en un capítulo
 *   concept:list          — lista conceptos de un capítulo
 *   concept:get           — obtiene un concepto por id
 *   concept:update        — actualiza campos de un concepto
 *   concept:delete        — elimina un concepto
 *   concept:reorder       — reordena conceptos dentro de un capítulo
 *   concept:lock          — bloquea un concepto (no reversible desde UI)
 *
 *   APU Components
 *   ──────────────
 *   apu:add-component     — agrega un componente al APU de un concepto
 *   apu:list-components   — lista los componentes del APU de un concepto
 *   apu:update-component  — actualiza un componente (cantidad, precio, descripción)
 *   apu:delete-component  — elimina un componente
 *   apu:reorder           — reordena componentes dentro de un APU
 */

import { ipcMain } from 'electron'
import { getCurrentDb } from './project.handlers'
import { PhaseRepository } from '../db/repositories/PhaseRepository'
import { ChapterRepository } from '../db/repositories/ChapterRepository'
import { ConceptRepository } from '../db/repositories/ConceptRepository'
import { ApuRepository } from '../db/repositories/ApuRepository'

export function registerBudgetHandlers(): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // FASES
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle(
    'phase:create',
    (
      _event,
      input: {
        name: string
        description?: string
      }
    ) => {
      return new PhaseRepository(getCurrentDb()).createPhase(input)
    }
  )

  ipcMain.handle('phase:list', () => {
    return new PhaseRepository(getCurrentDb()).getPhases()
  })

  ipcMain.handle(
    'phase:update',
    (
      _event,
      id: string,
      updates: {
        name?: string
        description?: string
      }
    ) => {
      return new PhaseRepository(getCurrentDb()).updatePhase(id, updates)
    }
  )

  ipcMain.handle('phase:delete', (_event, id: string) => {
    return new PhaseRepository(getCurrentDb()).deletePhase(id)
  })

  ipcMain.handle('phase:reorder', (_event, orderedIds: string[]) => {
    return new PhaseRepository(getCurrentDb()).reorderPhases(orderedIds)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPÍTULOS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle(
    'chapter:create',
    (
      _event,
      input: {
        phase_id: string
        name: string
        description?: string
      }
    ) => {
      return new ChapterRepository(getCurrentDb()).createChapter(input)
    }
  )

  ipcMain.handle('chapter:list', (_event, phase_id: string) => {
    return new ChapterRepository(getCurrentDb()).getChapters(phase_id)
  })

  ipcMain.handle(
    'chapter:update',
    (
      _event,
      id: string,
      updates: {
        name?: string
        description?: string
      }
    ) => {
      return new ChapterRepository(getCurrentDb()).updateChapter(id, updates)
    }
  )

  ipcMain.handle('chapter:delete', (_event, id: string) => {
    return new ChapterRepository(getCurrentDb()).deleteChapter(id)
  })

  ipcMain.handle('chapter:reorder', (_event, phase_id: string, orderedIds: string[]) => {
    return new ChapterRepository(getCurrentDb()).reorderChapters(phase_id, orderedIds)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCEPTOS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle(
    'concept:create',
    (
      _event,
      input: {
        chapter_id: string
        description: string
        unit: string
        quantity?: number
        unit_price?: number
      }
    ) => {
      return new ConceptRepository(getCurrentDb()).createConcept(input)
    }
  )

  ipcMain.handle('concept:list', (_event, chapter_id: string) => {
    return new ConceptRepository(getCurrentDb()).getConcepts(chapter_id)
  })

  ipcMain.handle('concept:get', (_event, id: string) => {
    return new ConceptRepository(getCurrentDb()).findById(id)
  })

  ipcMain.handle(
    'concept:update',
    (
      _event,
      id: string,
      updates: {
        description?: string
        unit?: string
        quantity?: number
        unit_price?: number
      }
    ) => {
      return new ConceptRepository(getCurrentDb()).updateConcept(id, updates)
    }
  )

  ipcMain.handle('concept:delete', (_event, id: string) => {
    return new ConceptRepository(getCurrentDb()).deleteConcept(id)
  })

  ipcMain.handle('concept:reorder', (_event, chapter_id: string, orderedIds: string[]) => {
    return new ConceptRepository(getCurrentDb()).reorderConcepts(chapter_id, orderedIds)
  })

  ipcMain.handle('concept:lock', (_event, id: string) => {
    return new ConceptRepository(getCurrentDb()).lockConcept(id)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // APU COMPONENTS
  // ═══════════════════════════════════════════════════════════════════════════

  ipcMain.handle(
    'apu:add-component',
    (
      _event,
      input: {
        concept_id: string
        type: 'material' | 'labor' | 'equipment' | 'subcontract'
        description: string
        unit: string
        quantity: number
        unit_price: number
      }
    ) => {
      return new ApuRepository(getCurrentDb()).addComponent(input)
    }
  )

  ipcMain.handle('apu:list-components', (_event, concept_id: string) => {
    return new ApuRepository(getCurrentDb()).getComponents(concept_id)
  })

  ipcMain.handle(
    'apu:update-component',
    (
      _event,
      id: string,
      updates: {
        description?: string
        unit?: string
        quantity?: number
        unit_price?: number
      }
    ) => {
      return new ApuRepository(getCurrentDb()).updateComponent(id, updates)
    }
  )

  ipcMain.handle('apu:delete-component', (_event, id: string) => {
    return new ApuRepository(getCurrentDb()).deleteComponent(id)
  })

  ipcMain.handle('apu:reorder', (_event, concept_id: string, orderedIds: string[]) => {
    return new ApuRepository(getCurrentDb()).reorderComponents(concept_id, orderedIds)
  })
}
