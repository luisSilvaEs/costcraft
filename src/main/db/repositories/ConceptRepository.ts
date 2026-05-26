/**
 * ConceptRepository
 *
 * CRUD for the `concepts` table.
 *
 * Concepts are the third level of the budget hierarchy:
 *   project_info → phases → chapters → concepts → apu_components
 *
 * Each concept has a unit price and quantity. Once a concept has at least one
 * execution_log entry, it becomes locked (is_locked = 1) and its unit and
 * unit_price can no longer be modified — only quantity and description are
 * still editable after locking.
 */

import Database from 'better-sqlite3'
import type { CreateConceptInput, ConceptRow, UpdateConceptInput } from '../../../shared/types'

// ─── Repository ───────────────────────────────────────────────────────────────

export class ConceptRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  // ── createConcept ──────────────────────────────────────────────────────────

  /**
   * Inserts a new concept at the end of the given chapter.
   * Throws if description or unit is empty, or if chapter does not exist.
   */
  createConcept(input: CreateConceptInput): ConceptRow {
    const { chapter_id, description, unit, quantity = 0, unit_price = 0, code = null } = input

    if (!description || !description.trim()) {
      throw new Error('ConceptRepository.createConcept: description is required.')
    }

    if (!unit || !unit.trim()) {
      throw new Error('ConceptRepository.createConcept: unit is required.')
    }

    const chapterExists = this.db
      .prepare(`SELECT 1 FROM chapters WHERE id = @chapter_id`)
      .get({ chapter_id })

    if (!chapterExists) {
      throw new Error(`ConceptRepository.createConcept: chapter '${chapter_id}' not found.`)
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const position = this.db
      .prepare(`SELECT COUNT(*) FROM concepts WHERE chapter_id = @chapter_id`)
      .pluck()
      .get({ chapter_id }) as number

    this.db
      .prepare(
        `INSERT INTO concepts
           (id, chapter_id, code, description, unit, quantity, unit_price, position, created_at, updated_at)
         VALUES
           (@id, @chapter_id, @code, @description, @unit, @quantity, @unit_price, @position, @now, @now)`
      )
      .run({
        id,
        chapter_id,
        code,
        description: description.trim(),
        unit: unit.trim(),
        quantity,
        unit_price,
        position,
        now
      })

    return this.findById(id)!
  }

  // ── getConcepts ────────────────────────────────────────────────────────────

  /**
   * Returns all concepts for a chapter, ordered by position ascending.
   */
  getConcepts(chapter_id: string): ConceptRow[] {
    return this.db
      .prepare(`SELECT * FROM concepts WHERE chapter_id = @chapter_id ORDER BY position ASC`)
      .all({ chapter_id }) as ConceptRow[]
  }

  // ── updateConcept ──────────────────────────────────────────────────────────

  /**
   * Updates concept fields respecting the lock rules:
   *
   *   Unlocked → all fields editable.
   *   Locked   → only description, quantity, and code are editable.
   *              Attempting to change unit or unit_price throws.
   *
   * Throws if the concept does not exist or input is empty.
   */
  updateConcept(id: string, input: UpdateConceptInput): ConceptRow {
    const keys = Object.keys(input) as (keyof UpdateConceptInput)[]

    if (keys.length === 0) {
      throw new Error('ConceptRepository.updateConcept: input must have at least one field.')
    }

    const concept = this.findById(id)
    if (!concept) {
      throw new Error(`ConceptRepository.updateConcept: concept '${id}' not found.`)
    }

    if (concept.is_locked) {
      const protectedFields: (keyof UpdateConceptInput)[] = ['unit', 'unit_price']
      const violations = keys.filter((k) => protectedFields.includes(k))

      if (violations.length > 0) {
        throw new Error(
          `ConceptRepository.updateConcept: cannot modify [${violations.join(', ')}] on a locked concept.`
        )
      }
    }

    const now = new Date().toISOString()
    const setClauses = keys.map((k) => `${k} = @${k}`).join(', ')

    this.db
      .prepare(`UPDATE concepts SET ${setClauses}, updated_at = @updated_at WHERE id = @id`)
      .run({ ...input, updated_at: now, id })

    return this.findById(id)!
  }

  // ── lockConcept ────────────────────────────────────────────────────────────

  /**
   * Marks a concept as locked. Called by the execution layer when the first
   * execution_log entry is inserted for this concept.
   *
   * Idempotent: locking an already-locked concept is a no-op.
   */
  lockConcept(id: string): ConceptRow {
    const concept = this.findById(id)
    if (!concept) {
      throw new Error(`ConceptRepository.lockConcept: concept '${id}' not found.`)
    }

    if (concept.is_locked) return concept

    const now = new Date().toISOString()

    this.db
      .prepare(
        `UPDATE concepts SET is_locked = 1, locked_at = @now, updated_at = @now WHERE id = @id`
      )
      .run({ now, id })

    return this.findById(id)!
  }

  // ── deleteConcept ──────────────────────────────────────────────────────────

  /**
   * Deletes a concept and all its apu_components and execution_log entries
   * via ON DELETE CASCADE.
   *
   * Compacts sibling positions after deletion.
   * Returns true if deleted, false if the concept did not exist.
   */
  deleteConcept(id: string): boolean {
    const concept = this.findById(id)
    if (!concept) return false

    this.db.prepare(`DELETE FROM concepts WHERE id = @id`).run({ id })
    this.compactPositions(concept.chapter_id)

    return true
  }

  // ── reorderConcepts ────────────────────────────────────────────────────────

  /**
   * Updates positions for all concepts in a chapter atomically.
   * `orderedIds` must contain every concept id for the chapter.
   */
  reorderConcepts(chapter_id: string, orderedIds: string[]): ConceptRow[] {
    const current = this.getConcepts(chapter_id)

    if (orderedIds.length !== current.length) {
      throw new Error(
        `ConceptRepository.reorderConcepts: expected ${current.length} ids, got ${orderedIds.length}.`
      )
    }

    const currentIds = new Set(current.map((c) => c.id))
    for (const id of orderedIds) {
      if (!currentIds.has(id)) {
        throw new Error(`ConceptRepository.reorderConcepts: unknown concept id '${id}'.`)
      }
    }

    const update = this.db.prepare(`UPDATE concepts SET position = @position WHERE id = @id`)

    this.db.transaction(() => {
      orderedIds.forEach((id, position) => update.run({ id, position }))
    })()

    return this.getConcepts(chapter_id)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  findById(id: string): ConceptRow | null {
    const row = this.db.prepare(`SELECT * FROM concepts WHERE id = @id`).get({ id }) as
      | ConceptRow
      | undefined

    return row ?? null
  }

  private compactPositions(chapter_id: string): void {
    const concepts = this.getConcepts(chapter_id)

    const update = this.db.prepare(`UPDATE concepts SET position = @position WHERE id = @id`)

    this.db.transaction(() => {
      concepts.forEach((concept, index) => update.run({ id: concept.id, position: index }))
    })()
  }
}
