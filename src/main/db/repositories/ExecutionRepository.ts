/**
 * ExecutionRepository
 *
 * CRUD for the `execution_log` table.
 *
 * Records real progress (quantity executed) against budgeted concepts.
 * Key behavior: inserting the FIRST entry for a concept automatically locks
 * that concept via ConceptRepository.lockConcept(), preventing further
 * modifications to its unit price and unit.
 *
 * The log is append-only by design — entries are never updated, only added
 * or deleted. Total executed quantity is always derived by summing the log.
 */

import Database from 'better-sqlite3'
import { ConceptRepository } from './ConceptRepository'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateExecutionEntryInput {
  concept_id: string
  date: string // ISO date string: 'YYYY-MM-DD'
  quantity_executed: number
  notes?: string
}

export interface ExecutionEntryRow {
  id: string
  concept_id: string
  date: string
  quantity_executed: number
  notes: string | null
  created_at: string
}

export interface ExecutionSummary {
  quantity_budgeted: number
  quantity_executed: number
  quantity_remaining: number
  progress_pct: number // 0–100, rounded to 1 decimal
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ExecutionRepository {
  private readonly db: Database.Database
  private readonly conceptRepo: ConceptRepository

  constructor(db: Database.Database) {
    this.db = db
    this.conceptRepo = new ConceptRepository(db)
  }

  // ── addEntry ───────────────────────────────────────────────────────────────

  /**
   * Records a new execution entry for a concept.
   *
   * If this is the first entry for the concept, the concept is locked
   * automatically — unit and unit_price can no longer be modified.
   *
   * Throws if:
   *   - concept does not exist
   *   - quantity_executed is zero or negative
   *   - date is not a valid YYYY-MM-DD string
   */
  addEntry(input: CreateExecutionEntryInput): ExecutionEntryRow {
    const { concept_id, date, quantity_executed, notes = null } = input

    const concept = this.conceptRepo.findById(concept_id)
    if (!concept) {
      throw new Error(`ExecutionRepository.addEntry: concept '${concept_id}' not found.`)
    }

    if (quantity_executed <= 0) {
      throw new Error('ExecutionRepository.addEntry: quantity_executed must be greater than 0.')
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('ExecutionRepository.addEntry: date must be in YYYY-MM-DD format.')
    }

    // Lock on first entry — idempotent if already locked
    if (!concept.is_locked) {
      this.conceptRepo.lockConcept(concept_id)
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO execution_log (id, concept_id, date, quantity_executed, notes, created_at)
         VALUES (@id, @concept_id, @date, @quantity_executed, @notes, @now)`
      )
      .run({ id, concept_id, date, quantity_executed, notes, now })

    return this.findById(id)!
  }

  // ── getEntries ─────────────────────────────────────────────────────────────

  /**
   * Returns all execution entries for a concept, ordered by date ascending
   * then by created_at ascending (insertion order within the same day).
   */
  getEntries(concept_id: string): ExecutionEntryRow[] {
    return this.db
      .prepare(
        `SELECT * FROM execution_log
          WHERE concept_id = @concept_id
          ORDER BY date ASC, created_at ASC`
      )
      .all({ concept_id }) as ExecutionEntryRow[]
  }

  // ── getSummary ─────────────────────────────────────────────────────────────

  /**
   * Returns budgeted vs executed quantities and progress percentage.
   *
   * quantity_budgeted  → concept.quantity
   * quantity_executed  → SUM of all execution_log entries
   * quantity_remaining → budgeted - executed (can be negative if over-executed)
   * progress_pct       → (executed / budgeted) * 100, or 100 if budgeted = 0
   */
  getSummary(concept_id: string): ExecutionSummary {
    const concept = this.conceptRepo.findById(concept_id)
    if (!concept) {
      throw new Error(`ExecutionRepository.getSummary: concept '${concept_id}' not found.`)
    }

    const executed = this.db
      .prepare(
        `SELECT COALESCE(SUM(quantity_executed), 0) FROM execution_log WHERE concept_id = @concept_id`
      )
      .pluck()
      .get({ concept_id }) as number

    const budgeted = concept.quantity
    const remaining = parseFloat((budgeted - executed).toFixed(4))
    const progress_pct = budgeted === 0 ? 100 : parseFloat(((executed / budgeted) * 100).toFixed(1))

    return {
      quantity_budgeted: budgeted,
      quantity_executed: executed,
      quantity_remaining: remaining,
      progress_pct
    }
  }

  // ── deleteEntry ────────────────────────────────────────────────────────────

  /**
   * Deletes a single execution entry.
   *
   * Note: deleting all entries does NOT automatically unlock the concept.
   * Unlocking after deletion would allow retroactive APU modifications on
   * concepts that were already executed — a data integrity risk.
   *
   * Returns true if deleted, false if the entry did not exist.
   */
  deleteEntry(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM execution_log WHERE id = @id`).run({ id })

    return result.changes > 0
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private findById(id: string): ExecutionEntryRow | null {
    const row = this.db.prepare(`SELECT * FROM execution_log WHERE id = @id`).get({ id }) as
      | ExecutionEntryRow
      | undefined

    return row ?? null
  }
}
