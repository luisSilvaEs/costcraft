/**
 * ChapterRepository
 *
 * CRUD for the `chapters` table.
 *
 * Chapters are the second level of the budget hierarchy:
 *   project_info → phases → chapters → concepts → apu_components
 *
 * Each chapter belongs to a phase. Position is scoped per phase,
 * so each phase has its own independent 0-based sequence.
 */

import Database from 'better-sqlite3'
import type { CreateChapterInput, UpdateChapterInput, ChapterRow } from '../../../shared/types'

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Repository ───────────────────────────────────────────────────────────────

export class ChapterRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  // ── createChapter ──────────────────────────────────────────────────────────

  /**
   * Inserts a new chapter at the end of the given phase.
   * Position is scoped to the phase (each phase has its own sequence).
   * Throws if name is empty or phase does not exist.
   */
  createChapter(input: CreateChapterInput): ChapterRow {
    const { phase_id, name, code = null } = input

    if (!name || !name.trim()) {
      throw new Error('ChapterRepository.createChapter: name is required.')
    }

    // Verify phase exists — gives a clear error instead of a FK violation message
    const phaseExists = this.db
      .prepare(`SELECT 1 FROM phases WHERE id = @phase_id`)
      .get({ phase_id })

    if (!phaseExists) {
      throw new Error(`ChapterRepository.createChapter: phase '${phase_id}' not found.`)
    }

    const id = crypto.randomUUID()

    const count = this.db
      .prepare(`SELECT COUNT(*) FROM chapters WHERE phase_id = @phase_id`)
      .pluck()
      .get({ phase_id }) as number

    this.db
      .prepare(
        `INSERT INTO chapters (id, phase_id, code, name, position)
         VALUES (@id, @phase_id, @code, @name, @position)`
      )
      .run({ id, phase_id, code, name: name.trim(), position: count })

    return this.findById(id)!
  }

  // ── getChapters ────────────────────────────────────────────────────────────

  /**
   * Returns all chapters for a phase, ordered by position ascending.
   */
  getChapters(phase_id: string): ChapterRow[] {
    return this.db
      .prepare(`SELECT * FROM chapters WHERE phase_id = @phase_id ORDER BY position ASC`)
      .all({ phase_id }) as ChapterRow[]
  }

  // ── updateChapter ──────────────────────────────────────────────────────────

  /**
   * Updates name and/or code of a chapter.
   * Throws if the chapter does not exist or input is empty.
   */
  updateChapter(id: string, input: UpdateChapterInput): ChapterRow {
    const keys = Object.keys(input) as (keyof UpdateChapterInput)[]

    if (keys.length === 0) {
      throw new Error('ChapterRepository.updateChapter: input must have at least one field.')
    }

    if (!this.findById(id)) {
      throw new Error(`ChapterRepository.updateChapter: chapter '${id}' not found.`)
    }

    const setClauses = keys.map((k) => `${k} = @${k}`).join(', ')

    this.db.prepare(`UPDATE chapters SET ${setClauses} WHERE id = @id`).run({ ...input, id })

    return this.findById(id)!
  }

  // ── deleteChapter ──────────────────────────────────────────────────────────

  /**
   * Deletes a chapter and all its children (concepts → apu_components)
   * via ON DELETE CASCADE defined in the schema.
   *
   * Compacts sibling positions after deletion.
   * Returns true if deleted, false if the chapter did not exist.
   */
  deleteChapter(id: string): boolean {
    const chapter = this.findById(id)
    if (!chapter) return false

    this.db.prepare(`DELETE FROM chapters WHERE id = @id`).run({ id })
    this.compactPositions(chapter.phase_id)

    return true
  }

  // ── reorderChapters ────────────────────────────────────────────────────────

  /**
   * Updates positions for all chapters in a phase atomically.
   *
   * `orderedIds` must contain every chapter id for the phase.
   * The new position of each chapter equals its index in the array.
   *
   * Throws if the id list does not match the phase's chapters exactly.
   */
  reorderChapters(phase_id: string, orderedIds: string[]): ChapterRow[] {
    const current = this.getChapters(phase_id)

    if (orderedIds.length !== current.length) {
      throw new Error(
        `ChapterRepository.reorderChapters: expected ${current.length} ids, got ${orderedIds.length}.`
      )
    }

    const currentIds = new Set(current.map((c) => c.id))
    for (const id of orderedIds) {
      if (!currentIds.has(id)) {
        throw new Error(`ChapterRepository.reorderChapters: unknown chapter id '${id}'.`)
      }
    }

    const update = this.db.prepare(`UPDATE chapters SET position = @position WHERE id = @id`)

    this.db.transaction(() => {
      orderedIds.forEach((id, position) => update.run({ id, position }))
    })()

    return this.getChapters(phase_id)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private findById(id: string): ChapterRow | null {
    const row = this.db.prepare(`SELECT * FROM chapters WHERE id = @id`).get({ id }) as
      | ChapterRow
      | undefined

    return row ?? null
  }

  private compactPositions(phase_id: string): void {
    const chapters = this.getChapters(phase_id)

    const update = this.db.prepare(`UPDATE chapters SET position = @position WHERE id = @id`)

    this.db.transaction(() => {
      chapters.forEach((chapter, index) => update.run({ id: chapter.id, position: index }))
    })()
  }
}
