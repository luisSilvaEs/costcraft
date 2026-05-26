/**
 * src/preload/index.ts
 *
 * Expone `window.api` al renderer vía contextBridge.
 * Todos los tipos de retorno vienen de `src/shared/types.ts` — no hay
 * ningún `unknown` aquí; el renderer recibe tipos concretos en cada llamada.
 *
 * Patrón de error:
 *   El main process envuelve excepciones en { __ipcError: string }.
 *   `invoke` lo detecta y lo relanza como un Error normal para que el
 *   renderer pueda hacer try/catch como en cualquier llamada async.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  ProjectInfo,
  OpenProjectResult,
  CreateProjectResult,
  UpdateProjectInput,
  PhaseRow,
  CreatePhaseInput,
  UpdatePhaseInput,
  ChapterRow,
  CreateChapterInput,
  UpdateChapterInput,
  ConceptRow,
  CreateConceptInput,
  UpdateConceptInput,
  ApuComponentRow,
  ApuSummary,
  CreateApuComponentInput,
  UpdateApuComponentInput,
  ApuComponentType,
  PriceSource,
  ExecutionEntryRow,
  ExecutionSummary,
  CreateExecutionEntryInput,
  DeleteResult,
  RecentProjectRow
} from '../shared/types'

// ─── Helper ───────────────────────────────────────────────────────────────────

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await ipcRenderer.invoke(channel, ...args)

  if (result && typeof result === 'object' && '__ipcError' in result) {
    throw new Error(result.__ipcError as string)
  }

  return result as T
}

// ─── API expuesta al renderer ─────────────────────────────────────────────────

const api = {
  // ── App (recent projects) ──────────────────────────────────────────────────

  app: {
    /** Returns recently opened/created projects sorted by last opened date */
    getRecentProjects: () => invoke<RecentProjectRow[]>('app:get-recent-projects'),

    /** Removes a single entry from the recent list by file path */
    removeRecentProject: (file_path: string) =>
      invoke<{ removed: boolean }>('app:remove-recent-project', file_path),

    /** Removes entries whose .presupuesto file no longer exists on disk */
    pruneRecentProjects: () => invoke<{ pruned: number }>('app:prune-recent-projects')
  },

  // ── Proyecto ───────────────────────────────────────────────────────────────

  project: {
    /** Crea un archivo .presupuesto nuevo (abre diálogo Guardar como) */
    create: (input: { title: string; client?: string; description?: string }) =>
      invoke<CreateProjectResult | null>('project:new', input),

    /** Abre un archivo .presupuesto existente (abre diálogo Abrir) */
    open: () => invoke<OpenProjectResult | null>('project:open'),

    /** Abre un archivo .presupuesto directamente por su ruta, sin diálogo */
    openByPath: (filePath: string) =>
      invoke<OpenProjectResult | null>('project:open-by-path', filePath),

    /** Cierra el proyecto actualmente abierto */
    close: () => invoke<void>('project:close'),

    /** Obtiene los datos del proyecto (título, cliente, etc.) */
    getInfo: () => invoke<ProjectInfo>('project:get-info'),

    /** Actualiza los datos del proyecto */
    updateInfo: (updates: UpdateProjectInput) =>
      invoke<ProjectInfo>('project:update-info', updates),

    /** Devuelve la ruta del archivo abierto actualmente, o null */
    getPath: () => invoke<string | null>('project:get-path')
  },

  // ── Fases ──────────────────────────────────────────────────────────────────

  phase: {
    create: (input: CreatePhaseInput) => invoke<PhaseRow>('phase:create', input),

    list: () => invoke<PhaseRow[]>('phase:list'),

    update: (id: string, updates: UpdatePhaseInput) =>
      invoke<PhaseRow>('phase:update', id, updates),

    delete: (id: string) => invoke<boolean>('phase:delete', id),

    reorder: (orderedIds: string[]) => invoke<PhaseRow[]>('phase:reorder', orderedIds)
  },

  // ── Capítulos ──────────────────────────────────────────────────────────────

  chapter: {
    create: (input: CreateChapterInput) => invoke<ChapterRow>('chapter:create', input),

    list: (phase_id: string) => invoke<ChapterRow[]>('chapter:list', phase_id),

    update: (id: string, updates: UpdateChapterInput) =>
      invoke<ChapterRow>('chapter:update', id, updates),

    delete: (id: string) => invoke<boolean>('chapter:delete', id),

    reorder: (phase_id: string, orderedIds: string[]) =>
      invoke<ChapterRow[]>('chapter:reorder', phase_id, orderedIds)
  },

  // ── Conceptos ──────────────────────────────────────────────────────────────

  concept: {
    create: (input: CreateConceptInput) => invoke<ConceptRow>('concept:create', input),

    list: (chapter_id: string) => invoke<ConceptRow[]>('concept:list', chapter_id),

    get: (id: string) => invoke<ConceptRow | null>('concept:get', id),

    update: (id: string, updates: UpdateConceptInput) =>
      invoke<ConceptRow>('concept:update', id, updates),

    delete: (id: string) => invoke<boolean>('concept:delete', id),

    reorder: (chapter_id: string, orderedIds: string[]) =>
      invoke<ConceptRow[]>('concept:reorder', chapter_id, orderedIds)
  },

  // ── APU ────────────────────────────────────────────────────────────────────

  apu: {
    addComponent: (input: CreateApuComponentInput) =>
      invoke<ApuComponentRow>('apu:add-component', input),

    listComponents: (concept_id: string) =>
      invoke<ApuComponentRow[]>('apu:list-components', concept_id),

    getSummary: (concept_id: string) => invoke<ApuSummary>('apu:get-summary', concept_id),

    updateComponent: (
      id: string,
      updates: UpdateApuComponentInput & {
        type?: ApuComponentType
        price_source?: PriceSource
      }
    ) => invoke<ApuComponentRow>('apu:update-component', id, updates),

    deleteComponent: (id: string) => invoke<boolean>('apu:delete-component', id),

    reorder: (concept_id: string, orderedIds: string[]) =>
      invoke<ApuComponentRow[]>('apu:reorder', concept_id, orderedIds)
  },

  // ── Ejecución ──────────────────────────────────────────────────────────────

  execution: {
    addEntry: (input: CreateExecutionEntryInput) =>
      invoke<ExecutionEntryRow>('execution:add-entry', input),

    list: (concept_id: string) => invoke<ExecutionEntryRow[]>('execution:list', concept_id),

    getProgress: (concept_id: string) =>
      invoke<ExecutionSummary>('execution:get-progress', concept_id),

    deleteEntry: (id: string) => invoke<DeleteResult>('execution:delete-entry', id)
  }
}

// ─── Exponer al renderer ──────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('api', api)

// ─── Tipo exportado ───────────────────────────────────────────────────────────
//
// `Api` se usa en preload.d.ts para tipar window.api en el renderer.
// No afecta el runtime — solo existe en tiempo de compilación.

export type Api = typeof api
