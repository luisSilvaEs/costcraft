/**
 * ApuRepository.test.ts
 *
 * Run:
 *   pnpm test src/main/db/repositories/ApuRepository.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { DatabaseManager } from '../DatabaseManager'
import { ProjectRepository } from './ProjectRepository'
import { PhaseRepository } from './PhaseRepository'
import { ChapterRepository } from './ChapterRepository'
import { ConceptRepository } from './ConceptRepository'
import { ApuRepository } from './ApuRepository'

// ─── Setup ───────────────────────────────────────────────────────────────────

let tmpDir: string
let apuRepo: ApuRepository
let conceptRepo: ConceptRepository
let chapterId: string
let conceptId: string // unlocked
let lockedConceptId: string // locked

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'costcraft-test-'))
  const manager = new DatabaseManager(join(tmpDir, 'test.presupuesto'))
  manager.open()
  const db = manager.getDb()

  new ProjectRepository(db).createProject({ title: 'Proyecto Prueba' })
  const phaseId = new PhaseRepository(db).createPhase({ name: 'Fase 1' }).id
  chapterId = new ChapterRepository(db).createChapter({ phase_id: phaseId, name: 'Cap A' }).id

  conceptRepo = new ConceptRepository(db)

  conceptId = conceptRepo.createConcept({
    chapter_id: chapterId,
    description: 'Excavación en roca',
    unit: 'm³'
  }).id

  lockedConceptId = conceptRepo.createConcept({
    chapter_id: chapterId,
    description: 'Relleno compactado',
    unit: 'm³'
  }).id
  conceptRepo.lockConcept(lockedConceptId)

  apuRepo = new ApuRepository(db)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// Helper: creates a fresh unlocked concept in the same chapter
function makeUnlockedConcept(description = 'Concepto Temporal'): string {
  return conceptRepo.createConcept({ chapter_id: chapterId, description, unit: 'm' }).id
}

// ─── addComponent ─────────────────────────────────────────────────────────────

describe('addComponent', () => {
  it('adds a component and returns the row', () => {
    const comp = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'Explosivo ANFO',
      unit: 'kg',
      quantity: 5,
      unit_price: 45
    })

    expect(comp.id).toBeTruthy()
    expect(comp.concept_id).toBe(conceptId)
    expect(comp.type).toBe('material')
    expect(comp.description).toBe('Explosivo ANFO')
    expect(comp.unit).toBe('kg')
    expect(comp.quantity).toBe(5)
    expect(comp.unit_price).toBe(45)
    expect(comp.position).toBe(0)
    expect(comp.price_source).toBeNull()
    expect(comp.catalog_item_id).toBeNull()
  })

  it('saves price_source and catalog_item_id when provided', () => {
    const comp = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'Cemento Portland',
      unit: 'ton',
      price_source: 'catalog',
      catalog_item_id: 'cat-001'
    })

    expect(comp.price_source).toBe('catalog')
    expect(comp.catalog_item_id).toBe('cat-001')
  })

  it('trims whitespace from description and unit', () => {
    const comp = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'labor',
      description: '  Operador de maquinaria  ',
      unit: '  día  '
    })

    expect(comp.description).toBe('Operador de maquinaria')
    expect(comp.unit).toBe('día')
  })

  it('assigns sequential positions', () => {
    const a = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'A',
      unit: 'kg'
    })
    const b = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'labor',
      description: 'B',
      unit: 'hr'
    })
    const c = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'equipment',
      description: 'C',
      unit: 'hr'
    })

    expect(a.position).toBe(0)
    expect(b.position).toBe(1)
    expect(c.position).toBe(2)
  })

  it('throws if description is empty', () => {
    expect(() =>
      apuRepo.addComponent({ concept_id: conceptId, type: 'material', description: '', unit: 'kg' })
    ).toThrow()
  })

  it('throws if unit is empty', () => {
    expect(() =>
      apuRepo.addComponent({ concept_id: conceptId, type: 'labor', description: 'Peón', unit: '' })
    ).toThrow()
  })

  it('throws if concept does not exist', () => {
    expect(() =>
      apuRepo.addComponent({
        concept_id: 'id-fantasma',
        type: 'material',
        description: 'X',
        unit: 'kg'
      })
    ).toThrow()
  })

  it('throws if concept is locked', () => {
    expect(() =>
      apuRepo.addComponent({
        concept_id: lockedConceptId,
        type: 'material',
        description: 'X',
        unit: 'kg'
      })
    ).toThrow()
  })
})

// ─── getComponents ────────────────────────────────────────────────────────────

describe('getComponents', () => {
  it('returns empty array when concept has no components', () => {
    expect(apuRepo.getComponents(conceptId)).toEqual([])
  })

  it('returns components ordered by position', () => {
    apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'Primero',
      unit: 'kg'
    })
    apuRepo.addComponent({
      concept_id: conceptId,
      type: 'labor',
      description: 'Segundo',
      unit: 'hr'
    })
    apuRepo.addComponent({
      concept_id: conceptId,
      type: 'equipment',
      description: 'Tercero',
      unit: 'hr'
    })

    const names = apuRepo.getComponents(conceptId).map((c) => c.description)
    expect(names).toEqual(['Primero', 'Segundo', 'Tercero'])
  })
})

// ─── getSummary ───────────────────────────────────────────────────────────────

describe('getSummary', () => {
  it('returns zeros for a concept with no components', () => {
    expect(apuRepo.getSummary(conceptId)).toEqual({
      material: 0,
      labor: 0,
      equipment: 0,
      subcontract: 0,
      total: 0
    })
  })

  it('sums subtotals correctly per type', () => {
    // material: 5 * 45 = 225
    apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'ANFO',
      unit: 'kg',
      quantity: 5,
      unit_price: 45
    })
    // labor:    8 * 120 = 960
    apuRepo.addComponent({
      concept_id: conceptId,
      type: 'labor',
      description: 'Operador',
      unit: 'hr',
      quantity: 8,
      unit_price: 120
    })
    // equipment: 1 * 850 = 850
    apuRepo.addComponent({
      concept_id: conceptId,
      type: 'equipment',
      description: 'Compresor',
      unit: 'hr',
      quantity: 1,
      unit_price: 850
    })

    const summary = apuRepo.getSummary(conceptId)

    expect(summary.material).toBe(225)
    expect(summary.labor).toBe(960)
    expect(summary.equipment).toBe(850)
    expect(summary.subcontract).toBe(0)
    expect(summary.total).toBe(2035)
  })

  it('accumulates multiple components of the same type', () => {
    apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'Mat A',
      unit: 'kg',
      quantity: 2,
      unit_price: 100
    })
    apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'Mat B',
      unit: 'kg',
      quantity: 3,
      unit_price: 50
    })

    const summary = apuRepo.getSummary(conceptId)
    expect(summary.material).toBe(350) // 200 + 150
    expect(summary.total).toBe(350)
  })
})

// ─── updateComponent ──────────────────────────────────────────────────────────

describe('updateComponent', () => {
  it('updates quantity and unit_price', () => {
    const comp = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'Arena',
      unit: 'm³'
    })
    const updated = apuRepo.updateComponent(comp.id, { quantity: 10, unit_price: 280 })

    expect(updated.quantity).toBe(10)
    expect(updated.unit_price).toBe(280)
  })

  it('refreshes updated_at', async () => {
    const comp = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'labor',
      description: 'Peón',
      unit: 'día'
    })
    await new Promise((r) => setTimeout(r, 2))
    const updated = apuRepo.updateComponent(comp.id, { quantity: 3 })
    expect(updated.updated_at).not.toBe(comp.updated_at)
  })

  it('throws if component does not exist', () => {
    expect(() => apuRepo.updateComponent('id-fantasma', { quantity: 5 })).toThrow()
  })

  it('throws if input is empty', () => {
    const comp = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'X',
      unit: 'kg'
    })
    expect(() => apuRepo.updateComponent(comp.id, {})).toThrow()
  })

  it('throws if parent concept is locked', () => {
    const id = makeUnlockedConcept('Para bloquear')
    const comp = apuRepo.addComponent({
      concept_id: id,
      type: 'material',
      description: 'X',
      unit: 'kg'
    })
    conceptRepo.lockConcept(id)

    expect(() => apuRepo.updateComponent(comp.id, { quantity: 99 })).toThrow()
  })
})

// ─── deleteComponent ──────────────────────────────────────────────────────────

describe('deleteComponent', () => {
  it('deletes a component and returns true', () => {
    const comp = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'X',
      unit: 'kg'
    })
    expect(apuRepo.deleteComponent(comp.id)).toBe(true)
    expect(apuRepo.getComponents(conceptId)).toHaveLength(0)
  })

  it('returns false if component does not exist', () => {
    expect(apuRepo.deleteComponent('id-fantasma')).toBe(false)
  })

  it('compacts positions after deletion', () => {
    const a = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'A',
      unit: 'kg'
    })
    const b = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'labor',
      description: 'B',
      unit: 'hr'
    })
    const c = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'equipment',
      description: 'C',
      unit: 'hr'
    })

    apuRepo.deleteComponent(b.id)

    const remaining = apuRepo.getComponents(conceptId)
    expect(remaining.map((x) => x.position)).toEqual([0, 1])
    expect(remaining.map((x) => x.description)).toEqual(['A', 'C'])
  })

  it('throws if parent concept is locked', () => {
    const id = makeUnlockedConcept('Para bloquear 2')
    const comp = apuRepo.addComponent({
      concept_id: id,
      type: 'material',
      description: 'X',
      unit: 'kg'
    })
    conceptRepo.lockConcept(id)

    expect(() => apuRepo.deleteComponent(comp.id)).toThrow()
  })
})

// ─── reorderComponents ────────────────────────────────────────────────────────

describe('reorderComponents', () => {
  it('reassigns positions according to the given order', () => {
    const a = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'A',
      unit: 'kg'
    })
    const b = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'labor',
      description: 'B',
      unit: 'hr'
    })
    const c = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'equipment',
      description: 'C',
      unit: 'hr'
    })

    const reordered = apuRepo.reorderComponents(conceptId, [c.id, a.id, b.id])

    expect(reordered.map((x) => x.description)).toEqual(['C', 'A', 'B'])
    expect(reordered.map((x) => x.position)).toEqual([0, 1, 2])
  })

  it('throws if id count does not match', () => {
    const a = apuRepo.addComponent({
      concept_id: conceptId,
      type: 'material',
      description: 'A',
      unit: 'kg'
    })
    apuRepo.addComponent({ concept_id: conceptId, type: 'labor', description: 'B', unit: 'hr' })

    expect(() => apuRepo.reorderComponents(conceptId, [a.id])).toThrow()
  })

  it('throws if an unknown id is included', () => {
    apuRepo.addComponent({ concept_id: conceptId, type: 'material', description: 'A', unit: 'kg' })
    expect(() => apuRepo.reorderComponents(conceptId, ['id-desconocido'])).toThrow()
  })

  it('throws if concept is locked', () => {
    expect(() => apuRepo.reorderComponents(lockedConceptId, [])).toThrow()
  })
})
