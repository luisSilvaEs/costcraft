/**
 * PhaseRepository
 *
 * CRUD for the `phases` table.
 *
 * Phases are the first level of the budget hierarchy:
 *   project_info → phases → chapters → concepts → apu_components
 *
 * Position is managed explicitly so the UI can reorder phases via drag-and-drop.
 * Positions are 0-based integers kept contiguous by reorderPhases().
 */

import Database from 'better-sqlite3'
import type { CreatePhaseInput, PhaseRow, UpdatePhaseInput } from '../../../shared/types'

// ─── Repository ───────────────────────────────────────────────────────────────

export class PhaseRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  // ── createPhase ────────────────────────────────────────────────────────────

  /**
   * Inserts a new phase at the end of the current list.
   * Position is assigned automatically as max(position) + 1.
   * Throws if name is empty.
   */
  createPhase(input: CreatePhaseInput): PhaseRow {
    const { name, code = null } = input

    if (!name || !name.trim()) {
      throw new Error('PhaseRepository.createPhase: name is required.')
    }

    const id = crypto.randomUUID()

    // Next position = current count (0-based, so count == next index)
    const count = this.db
      .prepare(`SELECT COUNT(*) FROM phases WHERE project_id = 1`)
      .pluck()
      .get() as number

    this.db
      .prepare(
        `INSERT INTO phases (id, project_id, code, name, position)
         VALUES (@id, 1, @code, @name, @position)`
      )
      .run({ id, code, name: name.trim(), position: count })

    return this.findById(id)!
  }

  // ── getPhases ──────────────────────────────────────────────────────────────

  /**
   * Returns all phases for the project, ordered by position ascending.
   */
  getPhases(): PhaseRow[] {
    return this.db
      .prepare(`SELECT * FROM phases WHERE project_id = 1 ORDER BY position ASC`)
      .all() as PhaseRow[]
  }

  // ── updatePhase ────────────────────────────────────────────────────────────

  /**
   * Updates name and/or code of a phase.
   * Throws if the phase does not exist.
   * Throws if input is empty.
   */
  updatePhase(id: string, input: UpdatePhaseInput): PhaseRow {
    const keys = Object.keys(input) as (keyof UpdatePhaseInput)[]

    if (keys.length === 0) {
      throw new Error('PhaseRepository.updatePhase: input must have at least one field.')
    }

    if (!this.findById(id)) {
      throw new Error(`PhaseRepository.updatePhase: phase '${id}' not found.`)
    }

    const setClauses = keys.map((k) => `${k} = @${k}`).join(', ')

    this.db.prepare(`UPDATE phases SET ${setClauses} WHERE id = @id`).run({ ...input, id })

    return this.findById(id)!
  }

  // ── deletePhase ────────────────────────────────────────────────────────────

  /**
   * Deletes a phase and all its children (chapters → concepts → apu_components)
   * via ON DELETE CASCADE defined in the schema.
   *
   * After deletion, resets positions to keep them contiguous (0, 1, 2 …).
   *
   * Returns true if deleted, false if the phase did not exist.
   */
  deletePhase(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM phases WHERE id = @id`).run({ id })

    if (result.changes === 0) return false

    this.compactPositions()
    return true
  }

  // ── reorderPhases ──────────────────────────────────────────────────────────

  /**
   * Updates positions for all phases in one atomic transaction.
   *
   * `orderedIds` must contain every phase id for the project — no partial
   * updates. The new position of each phase equals its index in the array.
   *
   * Throws if the id list does not match the current phases exactly.
   *
   * Usage (after a drag-and-drop):
   *   repo.reorderPhases(['id-c', 'id-a', 'id-b'])
   *   // phase 'id-c' → position 0, 'id-a' → 1, 'id-b' → 2
   */
  reorderPhases(orderedIds: string[]): PhaseRow[] {
    const current = this.getPhases()

    if (orderedIds.length !== current.length) {
      throw new Error(
        `PhaseRepository.reorderPhases: expected ${current.length} ids, got ${orderedIds.length}.`
      )
    }

    const currentIds = new Set(current.map((p) => p.id))
    for (const id of orderedIds) {
      if (!currentIds.has(id)) {
        throw new Error(`PhaseRepository.reorderPhases: unknown phase id '${id}'.`)
      }
    }

    const update = this.db.prepare(`UPDATE phases SET position = @position WHERE id = @id`)

    this.db.transaction(() => {
      orderedIds.forEach((id, position) => update.run({ id, position }))
    })()

    return this.getPhases()
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private findById(id: string): PhaseRow | null {
    const row = this.db.prepare(`SELECT * FROM phases WHERE id = @id`).get({ id }) as
      | PhaseRow
      | undefined

    return row ?? null
  }

  /**
   * Resets positions to 0, 1, 2 … after a deletion to keep them contiguous.
   */
  private compactPositions(): void {
    const phases = this.getPhases()

    const update = this.db.prepare(`UPDATE phases SET position = @position WHERE id = @id`)

    this.db.transaction(() => {
      phases.forEach((phase, index) => update.run({ id: phase.id, position: index }))
    })()
  }
}
