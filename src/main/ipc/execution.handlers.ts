/**
 * execution.handlers.ts
 *
 * IPC handlers para el registro de avance real (execution_log).
 *
 * Canales registrados:
 *   execution:add-entry     — registra una entrada de avance
 *   execution:list          — lista entradas de un concepto
 *   execution:get-progress  — resumen de avance (ejecutado vs. presupuestado)
 *   execution:delete-entry  — elimina una entrada
 */

import { ipcMain } from 'electron'
import { getCurrentDb } from './project.handlers'
import { ExecutionRepository } from '../db/repositories/ExecutionRepository'

export function registerExecutionHandlers(): void {
  // ── execution:add-entry ────────────────────────────────────────────────────
  //
  // Registra una entrada de avance para un concepto.
  // Si es la primera entrada, el concepto queda bloqueado automáticamente
  // (ver ExecutionRepository.addEntry).
  //
  // Payload: { concept_id, date, quantity_executed, notes? }

  ipcMain.handle(
    'execution:add-entry',
    (
      _event,
      input: {
        concept_id: string
        date: string // ISO date: "2025-11-20"
        quantity_executed: number
        notes?: string
      }
    ) => {
      return new ExecutionRepository(getCurrentDb()).addEntry(input)
    }
  )

  // ── execution:list ─────────────────────────────────────────────────────────
  //
  // Lista todas las entradas de avance de un concepto, ordenadas por fecha.

  ipcMain.handle('execution:list', (_event, concept_id: string) => {
    return new ExecutionRepository(getCurrentDb()).getEntries(concept_id)
  })

  // ── execution:get-progress ─────────────────────────────────────────────────
  //
  // Calcula el resumen de avance para un concepto:
  //   - quantity_budgeted   (de concepts.quantity)
  //   - quantity_executed   (suma de entradas)
  //   - quantity_remaining  (presupuestado - ejecutado)
  //   - progress_pct        (0-100)

  ipcMain.handle('execution:get-progress', (_event, concept_id: string) => {
    return new ExecutionRepository(getCurrentDb()).getSummary(concept_id)
  })

  // ── execution:delete-entry ─────────────────────────────────────────────────
  //
  // Elimina una entrada de avance por id.
  // Nota: el bloqueo del concepto NO se revierte al eliminar entradas.
  //
  // Retorna: { deleted: boolean }

  ipcMain.handle('execution:delete-entry', (_event, id: string) => {
    const deleted = new ExecutionRepository(getCurrentDb()).deleteEntry(id)
    return { deleted }
  })
}
