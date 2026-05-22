/**
 * ApuRepository
 *
 * CRUD for the `apu_components` table.
 *
 * Each concept has a list of APU components that break down its unit price:
 *   concept → apu_components (material | labor | equipment | subcontract)
 *
 * The sum of all component subtotals (quantity * unit_price) represents
 * the unit price of the parent concept.
 *
 * Lock rule (inherited from the parent concept):
 *   Once a concept is locked (is_locked = 1), its APU components cannot be
 *   added, modified, or deleted. All mutating methods check this before acting.
 */

import Database from 'better-sqlite3'
import type {
  ApuComponentRow,
  ApuSummary,
  CreateApuComponentInput,
  UpdateApuComponentInput
} from '../../../shared/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApuComponentType = 'material' | 'labor' | 'equipment' | 'subcontract'
export type PriceSource = 'manual' | 'catalog' | 'inegi'

// ─── Repository ───────────────────────────────────────────────────────────────

export class ApuRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  // ── addComponent ───────────────────────────────────────────────────────────

  /**
   * Adds a new APU component to a concept.
   * Throws if the concept is locked, does not exist, or required fields are empty.
   */
  addComponent(input: CreateApuComponentInput): ApuComponentRow {
    const {
      concept_id,
      type,
      description,
      unit,
      quantity = 0,
      unit_price = 0,
      price_source = null,
      catalog_item_id = null
    } = input

    if (!description || !description.trim()) {
      throw new Error('ApuRepository.addComponent: description is required.')
    }

    if (!unit || !unit.trim()) {
      throw new Error('ApuRepository.addComponent: unit is required.')
    }

    const concept = this.db
      .prepare(`SELECT is_locked FROM concepts WHERE id = @concept_id`)
      .get({ concept_id }) as { is_locked: number } | undefined

    if (!concept) {
      throw new Error(`ApuRepository.addComponent: concept '${concept_id}' not found.`)
    }

    if (concept.is_locked) {
      throw new Error(
        `ApuRepository.addComponent: concept '${concept_id}' is locked. APU cannot be modified.`
      )
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const position = this.db
      .prepare(`SELECT COUNT(*) FROM apu_components WHERE concept_id = @concept_id`)
      .pluck()
      .get({ concept_id }) as number

    this.db
      .prepare(
        `INSERT INTO apu_components
           (id, concept_id, type, description, unit, quantity, unit_price,
            price_source, catalog_item_id, position, created_at, updated_at)
         VALUES
           (@id, @concept_id, @type, @description, @unit, @quantity, @unit_price,
            @price_source, @catalog_item_id, @position, @now, @now)`
      )
      .run({
        id,
        concept_id,
        type,
        description: description.trim(),
        unit: unit.trim(),
        quantity,
        unit_price,
        price_source,
        catalog_item_id,
        position,
        now
      })

    return this.findById(id)!
  }

  // ── getComponents ──────────────────────────────────────────────────────────

  /**
   * Returns all APU components for a concept, ordered by position ascending.
   */
  getComponents(concept_id: string): ApuComponentRow[] {
    return this.db
      .prepare(`SELECT * FROM apu_components WHERE concept_id = @concept_id ORDER BY position ASC`)
      .all({ concept_id }) as ApuComponentRow[]
  }

  // ── getSummary ─────────────────────────────────────────────────────────────

  /**
   * Returns the subtotal per type and the grand total for a concept.
   * All values are rounded to 2 decimal places.
   */
  getSummary(concept_id: string): ApuSummary {
    const rows = this.db
      .prepare(
        `SELECT type, ROUND(SUM(quantity * unit_price), 2) as subtotal
           FROM apu_components
          WHERE concept_id = @concept_id
          GROUP BY type`
      )
      .all({ concept_id }) as { type: ApuComponentType; subtotal: number }[]

    const summary: ApuSummary = { material: 0, labor: 0, equipment: 0, subcontract: 0, total: 0 }

    for (const row of rows) {
      summary[row.type] = row.subtotal
    }

    summary.total = parseFloat(
      (summary.material + summary.labor + summary.equipment + summary.subcontract).toFixed(2)
    )

    return summary
  }

  // ── updateComponent ────────────────────────────────────────────────────────

  /**
   * Updates fields of an APU component.
   * Throws if the parent concept is locked, component does not exist, or input is empty.
   */
  updateComponent(id: string, input: UpdateApuComponentInput): ApuComponentRow {
    const keys = Object.keys(input) as (keyof UpdateApuComponentInput)[]

    if (keys.length === 0) {
      throw new Error('ApuRepository.updateComponent: input must have at least one field.')
    }

    const component = this.findById(id)
    if (!component) {
      throw new Error(`ApuRepository.updateComponent: component '${id}' not found.`)
    }

    this.assertConceptUnlocked(component.concept_id, 'updateComponent')

    const now = new Date().toISOString()
    const setClauses = keys.map((k) => `${k} = @${k}`).join(', ')

    this.db
      .prepare(`UPDATE apu_components SET ${setClauses}, updated_at = @updated_at WHERE id = @id`)
      .run({ ...input, updated_at: now, id })

    return this.findById(id)!
  }

  // ── deleteComponent ────────────────────────────────────────────────────────

  /**
   * Deletes an APU component and compacts sibling positions.
   * Throws if the parent concept is locked.
   * Returns true if deleted, false if the component did not exist.
   */
  deleteComponent(id: string): boolean {
    const component = this.findById(id)
    if (!component) return false

    this.assertConceptUnlocked(component.concept_id, 'deleteComponent')

    this.db.prepare(`DELETE FROM apu_components WHERE id = @id`).run({ id })
    this.compactPositions(component.concept_id)

    return true
  }

  // ── reorderComponents ──────────────────────────────────────────────────────

  /**
   * Updates positions for all components of a concept atomically.
   * `orderedIds` must contain every component id for the concept.
   * Throws if the parent concept is locked.
   */
  reorderComponents(concept_id: string, orderedIds: string[]): ApuComponentRow[] {
    this.assertConceptUnlocked(concept_id, 'reorderComponents')

    const current = this.getComponents(concept_id)

    if (orderedIds.length !== current.length) {
      throw new Error(
        `ApuRepository.reorderComponents: expected ${current.length} ids, got ${orderedIds.length}.`
      )
    }

    const currentIds = new Set(current.map((c) => c.id))
    for (const id of orderedIds) {
      if (!currentIds.has(id)) {
        throw new Error(`ApuRepository.reorderComponents: unknown component id '${id}'.`)
      }
    }

    const update = this.db.prepare(`UPDATE apu_components SET position = @position WHERE id = @id`)

    this.db.transaction(() => {
      orderedIds.forEach((id, position) => update.run({ id, position }))
    })()

    return this.getComponents(concept_id)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private findById(id: string): ApuComponentRow | null {
    const row = this.db.prepare(`SELECT * FROM apu_components WHERE id = @id`).get({ id }) as
      | ApuComponentRow
      | undefined

    return row ?? null
  }

  private assertConceptUnlocked(concept_id: string, method: string): void {
    const concept = this.db
      .prepare(`SELECT is_locked FROM concepts WHERE id = @concept_id`)
      .get({ concept_id }) as { is_locked: number } | undefined

    if (!concept) {
      throw new Error(`ApuRepository.${method}: concept '${concept_id}' not found.`)
    }

    if (concept.is_locked) {
      throw new Error(
        `ApuRepository.${method}: concept '${concept_id}' is locked. APU cannot be modified.`
      )
    }
  }

  private compactPositions(concept_id: string): void {
    const components = this.getComponents(concept_id)

    const update = this.db.prepare(`UPDATE apu_components SET position = @position WHERE id = @id`)

    this.db.transaction(() => {
      components.forEach((c, index) => update.run({ id: c.id, position: index }))
    })()
  }
}
