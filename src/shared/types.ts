/**
 * src/shared/types.ts
 *
 * Tipos del dominio compartidos entre el main process y el renderer.
 *
 * REGLA: este archivo no puede importar nada de Electron, better-sqlite3,
 * ni del sistema de archivos. Solo tipos TypeScript puros — así el renderer
 * puede importarlo directamente sin romper el sandbox de contextBridge.
 *
 * Estructura del dominio:
 *   ProjectInfo
 *     └── Phase[]
 *           └── Chapter[]
 *                 └── Concept[]
 *                       ├── ApuComponent[]
 *                       └── ExecutionEntry[]
 */

// ─── Proyecto ─────────────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'paused' | 'completed' | 'cancelled'

export interface ProjectInfo {
  id: number // siempre 1 (singleton)
  title: string
  client: string | null
  description: string | null
  status: ProjectStatus
  created_at: string
  updated_at: string
}

export interface CreateProjectInput {
  title: string
  client?: string
  description?: string
}

export interface UpdateProjectInput {
  title?: string
  client?: string
  description?: string
  status?: ProjectStatus
}

// ─── Fases ────────────────────────────────────────────────────────────────────

export interface PhaseRow {
  id: string
  project_id: number // siempre 1
  code: string | null
  name: string
  position: number
  created_at: string
}

export interface CreatePhaseInput {
  name: string
  code?: string
}

export interface UpdatePhaseInput {
  name?: string
  code?: string
}

// ─── Capítulos ────────────────────────────────────────────────────────────────

export interface ChapterRow {
  id: string
  phase_id: string
  code: string | null
  name: string
  position: number
  created_at: string
}

export interface CreateChapterInput {
  phase_id: string
  name: string
  code?: string
}

export interface UpdateChapterInput {
  name?: string
  code?: string
}

// ─── Conceptos ────────────────────────────────────────────────────────────────

export interface ConceptRow {
  id: string
  chapter_id: string
  code: string | null
  description: string
  unit: string
  quantity: number
  unit_price: number
  is_locked: number // 0 | 1  (SQLite no tiene boolean nativo)
  locked_at: string | null
  position: number
  created_at: string
  updated_at: string
}

/** ConceptRow con `is_locked` convertido a boolean para el renderer */
export interface ConceptDTO extends Omit<ConceptRow, 'is_locked'> {
  is_locked: boolean
  /** quantity * unit_price — calculado en el proceso de mapeo */
  total: number
}

export interface CreateConceptInput {
  chapter_id: string
  description: string
  unit: string
  quantity?: number
  unit_price?: number
  code?: string
}

export interface UpdateConceptInput {
  description?: string
  unit?: string
  quantity?: number
  unit_price?: number
  code?: string
}

// ─── Componentes APU ──────────────────────────────────────────────────────────

export type ApuComponentType = 'material' | 'labor' | 'equipment' | 'subcontract'
export type PriceSource = 'manual' | 'catalog' | 'inegi'

export interface ApuComponentRow {
  id: string
  concept_id: string
  type: ApuComponentType
  description: string
  unit: string
  quantity: number
  unit_price: number
  price_source: PriceSource | null
  catalog_item_id: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface CreateApuComponentInput {
  concept_id: string
  type: ApuComponentType
  description: string
  unit: string
  quantity?: number
  unit_price?: number
  price_source?: PriceSource
  catalog_item_id?: string
}

export interface UpdateApuComponentInput {
  description?: string
  unit?: string
  quantity?: number
  unit_price?: number
  price_source?: PriceSource
  catalog_item_id?: string
}

export interface ApuSummary {
  material: number
  labor: number
  equipment: number
  subcontract: number
  total: number
}

// ─── Ejecución ────────────────────────────────────────────────────────────────

export interface ExecutionEntryRow {
  id: string
  concept_id: string
  date: string // 'YYYY-MM-DD'
  quantity_executed: number
  notes: string | null
  created_at: string
}

export interface CreateExecutionEntryInput {
  concept_id: string
  date: string
  quantity_executed: number
  notes?: string
}

export interface ExecutionSummary {
  quantity_budgeted: number
  quantity_executed: number
  quantity_remaining: number
  progress_pct: number // 0–100, redondeado a 1 decimal
}

// ─── Respuestas IPC ───────────────────────────────────────────────────────────
//
// Tipos de retorno compuestos que usa el preload en window.api.

export interface OpenProjectResult {
  filePath: string
  projectInfo: ProjectInfo
}

export interface CreateProjectResult {
  filePath: string
}

export interface DeleteResult {
  deleted: boolean
}

// ─── App — Recent Projects ────────────────────────────────────────────────────
//
// Rows from app.db — the app-level database separate from .presupuesto files.

export interface RecentProjectRow {
  id: number
  file_path: string
  title: string
  client: string | null
  last_opened_at: string // ISO timestamp
}
