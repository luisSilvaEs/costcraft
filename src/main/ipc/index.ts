/**
 * preload/index.ts
 *
 * El puente seguro entre el renderer (React) y el main process.
 *
 * Expone `window.api` con todas las funciones disponibles para la UI.
 * El renderer NUNCA importa ipcRenderer directamente — siempre usa window.api.
 *
 * Patrón de error:
 *   Si el main process devuelve { __ipcError: string }, esta capa lo relanza
 *   como un Error normal. El renderer puede hacer try/catch como en cualquier
 *   llamada async.
 */

import { contextBridge, ipcRenderer } from 'electron'

// ─── Helper ───────────────────────────────────────────────────────────────────

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args)

  // El main process envuelve errores en { __ipcError: string }
  if (result && typeof result === 'object' && '__ipcError' in result) {
    throw new Error(result.__ipcError as string)
  }

  return result as T
}

// ─── API expuesta al renderer ─────────────────────────────────────────────────

const api = {
  // ── Proyecto ───────────────────────────────────────────────────────────────

  project: {
    /** Crea un archivo .presupuesto nuevo (abre diálogo Guardar como) */
    create: (input: { title: string; client?: string; description?: string }) =>
      invoke<{ filePath: string } | null>('project:new', input),

    /** Abre un archivo .presupuesto existente (abre diálogo Abrir) */
    open: () => invoke<{ filePath: string; projectInfo: unknown } | null>('project:open'),

    /** Cierra el proyecto actualmente abierto */
    close: () => invoke<void>('project:close'),

    /** Obtiene los datos del proyecto (título, cliente, etc.) */
    getInfo: () => invoke<unknown>('project:get-info'),

    /** Actualiza los datos del proyecto */
    updateInfo: (updates: {
      title?: string
      client?: string
      description?: string
      status?: string
    }) => invoke<unknown>('project:update-info', updates),

    /** Devuelve la ruta del archivo abierto actualmente, o null */
    getPath: () => invoke<string | null>('project:get-path')
  },

  // ── Fases ──────────────────────────────────────────────────────────────────

  phase: {
    create: (input: { name: string; description?: string }) =>
      invoke<unknown>('phase:create', input),

    list: () => invoke<unknown[]>('phase:list'),

    update: (id: string, updates: { name?: string; description?: string }) =>
      invoke<unknown>('phase:update', id, updates),

    delete: (id: string) => invoke<boolean>('phase:delete', id),

    reorder: (orderedIds: string[]) => invoke<void>('phase:reorder', orderedIds)
  },

  // ── Capítulos ──────────────────────────────────────────────────────────────

  chapter: {
    create: (input: { phase_id: string; name: string; description?: string }) =>
      invoke<unknown>('chapter:create', input),

    list: (phase_id: string) => invoke<unknown[]>('chapter:list', phase_id),

    update: (id: string, updates: { name?: string; description?: string }) =>
      invoke<unknown>('chapter:update', id, updates),

    delete: (id: string) => invoke<boolean>('chapter:delete', id),

    reorder: (phase_id: string, orderedIds: string[]) =>
      invoke<void>('chapter:reorder', phase_id, orderedIds)
  },

  // ── Conceptos ──────────────────────────────────────────────────────────────

  concept: {
    create: (input: {
      chapter_id: string
      description: string
      unit: string
      quantity?: number
      unit_price?: number
    }) => invoke<unknown>('concept:create', input),

    list: (chapter_id: string) => invoke<unknown[]>('concept:list', chapter_id),

    get: (id: string) => invoke<unknown>('concept:get', id),

    update: (
      id: string,
      updates: {
        description?: string
        unit?: string
        quantity?: number
        unit_price?: number
      }
    ) => invoke<unknown>('concept:update', id, updates),

    delete: (id: string) => invoke<boolean>('concept:delete', id),

    reorder: (chapter_id: string, orderedIds: string[]) =>
      invoke<void>('concept:reorder', chapter_id, orderedIds),

    lock: (id: string) => invoke<unknown>('concept:lock', id)
  },

  // ── APU ────────────────────────────────────────────────────────────────────

  apu: {
    addComponent: (input: {
      concept_id: string
      type: 'material' | 'labor' | 'equipment' | 'subcontract'
      description: string
      unit: string
      quantity: number
      unit_price: number
    }) => invoke<unknown>('apu:add-component', input),

    listComponents: (concept_id: string) => invoke<unknown[]>('apu:list-components', concept_id),

    updateComponent: (
      id: string,
      updates: {
        description?: string
        unit?: string
        quantity?: number
        unit_price?: number
      }
    ) => invoke<unknown>('apu:update-component', id, updates),

    deleteComponent: (id: string) => invoke<boolean>('apu:delete-component', id),

    reorder: (concept_id: string, orderedIds: string[]) =>
      invoke<void>('apu:reorder', concept_id, orderedIds)
  },

  // ── Ejecución ──────────────────────────────────────────────────────────────

  execution: {
    addEntry: (input: {
      concept_id: string
      date: string
      quantity_executed: number
      notes?: string
    }) => invoke<unknown>('execution:add-entry', input),

    list: (concept_id: string) => invoke<unknown[]>('execution:list', concept_id),

    getProgress: (concept_id: string) =>
      invoke<{
        quantity_budgeted: number
        quantity_executed: number
        quantity_remaining: number
        progress_pct: number
      }>('execution:get-progress', concept_id),

    deleteEntry: (id: string) => invoke<{ deleted: boolean }>('execution:delete-entry', id)
  }
}

// ─── Exponer al renderer ──────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('api', api)

// ─── Tipos para el renderer ───────────────────────────────────────────────────
//
// Este bloque solo importa durante el build de TypeScript — no afecta el
// runtime del preload. Genera el tipo `Window['api']` automáticamente a
// partir del objeto `api` de arriba.
//
// El renderer importa este archivo de tipos así:
//   /// <reference path="../../preload/index.d.ts" />
//   const result = await window.api.project.getInfo()

export type Api = typeof api
