/**
 * ConceptRepository.test.ts
 *
 * Run:
 *   pnpm test src/main/db/repositories/ConceptRepository.test.ts
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

// ─── Setup ───────────────────────────────────────────────────────────────────

let tmpDir: string
let conceptRepo: ConceptRepository
let chapterId: string
let altChapterId: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'costcraft-test-'))
  const manager = new DatabaseManager(join(tmpDir, 'test.presupuesto'))
  manager.open()
  const db = manager.getDb()

  new ProjectRepository(db).createProject({ title: 'Proyecto Prueba' })
  const phaseId = new PhaseRepository(db).createPhase({ name: 'Fase 1' }).id
  const chapterRepo = new ChapterRepository(db)
  chapterId = chapterRepo.createChapter({ phase_id: phaseId, name: 'Capítulo A' }).id
  altChapterId = chapterRepo.createChapter({ phase_id: phaseId, name: 'Capítulo B' }).id

  conceptRepo = new ConceptRepository(db)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── createConcept ────────────────────────────────────────────────────────────

describe('createConcept', () => {
  it('creates a concept and returns the row', () => {
    const concept = conceptRepo.createConcept({
      chapter_id: chapterId,
      description: 'Excavación en material tipo A',
      unit: 'm³'
    })

    expect(concept.id).toBeTruthy()
    expect(concept.description).toBe('Excavación en material tipo A')
    expect(concept.unit).toBe('m³')
    expect(concept.quantity).toBe(0)
    expect(concept.unit_price).toBe(0)
    expect(concept.is_locked).toBe(0)
    expect(concept.locked_at).toBeNull()
    expect(concept.position).toBe(0)
  })

  it('saves optional fields when provided', () => {
    const concept = conceptRepo.createConcept({
      chapter_id: chapterId,
      description: 'Relleno compactado',
      unit: 'm³',
      quantity: 150,
      unit_price: 320.5,
      code: 'TER-02'
    })

    expect(concept.quantity).toBe(150)
    expect(concept.unit_price).toBe(320.5)
    expect(concept.code).toBe('TER-02')
  })

  it('trims whitespace from description and unit', () => {
    const concept = conceptRepo.createConcept({
      chapter_id: chapterId,
      description: '  Plantilla de concreto  ',
      unit: '  m²  '
    })

    expect(concept.description).toBe('Plantilla de concreto')
    expect(concept.unit).toBe('m²')
  })

  it('assigns sequential positions within the same chapter', () => {
    const a = conceptRepo.createConcept({ chapter_id: chapterId, description: 'A', unit: 'm' })
    const b = conceptRepo.createConcept({ chapter_id: chapterId, description: 'B', unit: 'm' })
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'C', unit: 'm' })

    expect(a.position).toBe(0)
    expect(b.position).toBe(1)
    expect(c.position).toBe(2)
  })

  it('positions are scoped per chapter', () => {
    conceptRepo.createConcept({ chapter_id: chapterId, description: 'A', unit: 'm' })
    conceptRepo.createConcept({ chapter_id: chapterId, description: 'B', unit: 'm' })
    const first = conceptRepo.createConcept({
      chapter_id: altChapterId,
      description: 'X',
      unit: 'm'
    })

    expect(first.position).toBe(0)
  })

  it('throws if description is empty', () => {
    expect(() =>
      conceptRepo.createConcept({ chapter_id: chapterId, description: '', unit: 'm' })
    ).toThrow()
  })

  it('throws if unit is empty', () => {
    expect(() =>
      conceptRepo.createConcept({ chapter_id: chapterId, description: 'Algo', unit: '' })
    ).toThrow()
  })

  it('throws if chapter does not exist', () => {
    expect(() =>
      conceptRepo.createConcept({ chapter_id: 'id-fantasma', description: 'Algo', unit: 'm' })
    ).toThrow()
  })
})

// ─── getConcepts ──────────────────────────────────────────────────────────────

describe('getConcepts', () => {
  it('returns empty array for a chapter with no concepts', () => {
    expect(conceptRepo.getConcepts(chapterId)).toEqual([])
  })

  it('returns only concepts belonging to the requested chapter', () => {
    conceptRepo.createConcept({ chapter_id: chapterId, description: 'Del A', unit: 'm' })
    conceptRepo.createConcept({ chapter_id: altChapterId, description: 'Del B', unit: 'm' })

    const result = conceptRepo.getConcepts(chapterId)
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Del A')
  })

  it('returns concepts ordered by position', () => {
    conceptRepo.createConcept({ chapter_id: chapterId, description: 'Primero', unit: 'm' })
    conceptRepo.createConcept({ chapter_id: chapterId, description: 'Segundo', unit: 'm' })

    const names = conceptRepo.getConcepts(chapterId).map((c) => c.description)
    expect(names).toEqual(['Primero', 'Segundo'])
  })
})

// ─── updateConcept — unlocked ─────────────────────────────────────────────────

describe('updateConcept (unlocked)', () => {
  it('updates description', () => {
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'Vieja', unit: 'm' })
    const updated = conceptRepo.updateConcept(c.id, { description: 'Nueva' })
    expect(updated.description).toBe('Nueva')
  })

  it('updates unit_price and unit when unlocked', () => {
    const c = conceptRepo.createConcept({
      chapter_id: chapterId,
      description: 'Concreto',
      unit: 'm³'
    })
    const updated = conceptRepo.updateConcept(c.id, { unit_price: 1850, unit: 'm²' })

    expect(updated.unit_price).toBe(1850)
    expect(updated.unit).toBe('m²')
  })

  it('refreshes updated_at', async () => {
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'X', unit: 'm' })
    await new Promise((r) => setTimeout(r, 2))
    const updated = conceptRepo.updateConcept(c.id, { quantity: 10 })
    expect(updated.updated_at).not.toBe(c.updated_at)
  })

  it('throws if concept does not exist', () => {
    expect(() => conceptRepo.updateConcept('id-fantasma', { description: 'X' })).toThrow()
  })

  it('throws if input is empty', () => {
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'X', unit: 'm' })
    expect(() => conceptRepo.updateConcept(c.id, {})).toThrow()
  })
})

// ─── lockConcept ──────────────────────────────────────────────────────────────

describe('lockConcept', () => {
  it('sets is_locked = 1 and records locked_at', () => {
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'X', unit: 'm' })
    const locked = conceptRepo.lockConcept(c.id)

    expect(locked.is_locked).toBe(1)
    expect(locked.locked_at).toBeTruthy()
  })

  it('is idempotent — locking twice does not throw', () => {
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'X', unit: 'm' })
    conceptRepo.lockConcept(c.id)
    expect(() => conceptRepo.lockConcept(c.id)).not.toThrow()
  })

  it('throws if concept does not exist', () => {
    expect(() => conceptRepo.lockConcept('id-fantasma')).toThrow()
  })
})

// ─── updateConcept — locked ───────────────────────────────────────────────────

describe('updateConcept (locked)', () => {
  it('allows updating description after lock', () => {
    const c = conceptRepo.createConcept({
      chapter_id: chapterId,
      description: 'Original',
      unit: 'm'
    })
    conceptRepo.lockConcept(c.id)
    const updated = conceptRepo.updateConcept(c.id, { description: 'Actualizada' })
    expect(updated.description).toBe('Actualizada')
  })

  it('allows updating quantity after lock', () => {
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'X', unit: 'm' })
    conceptRepo.lockConcept(c.id)
    const updated = conceptRepo.updateConcept(c.id, { quantity: 99 })
    expect(updated.quantity).toBe(99)
  })

  it('throws when trying to modify unit_price after lock', () => {
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'X', unit: 'm' })
    conceptRepo.lockConcept(c.id)
    expect(() => conceptRepo.updateConcept(c.id, { unit_price: 999 })).toThrow()
  })

  it('throws when trying to modify unit after lock', () => {
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'X', unit: 'm' })
    conceptRepo.lockConcept(c.id)
    expect(() => conceptRepo.updateConcept(c.id, { unit: 'km' })).toThrow()
  })

  it('throws if input mixes allowed and protected fields', () => {
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'X', unit: 'm' })
    conceptRepo.lockConcept(c.id)
    // Even if description is valid, unit_price in the same call still throws
    expect(() =>
      conceptRepo.updateConcept(c.id, { description: 'Nueva', unit_price: 500 })
    ).toThrow()
  })
})

// ─── deleteConcept ────────────────────────────────────────────────────────────

describe('deleteConcept', () => {
  it('deletes a concept and returns true', () => {
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'X', unit: 'm' })
    expect(conceptRepo.deleteConcept(c.id)).toBe(true)
    expect(conceptRepo.getConcepts(chapterId)).toHaveLength(0)
  })

  it('returns false if concept does not exist', () => {
    expect(conceptRepo.deleteConcept('id-fantasma')).toBe(false)
  })

  it('compacts positions after deletion', () => {
    conceptRepo.createConcept({ chapter_id: chapterId, description: 'A', unit: 'm' })
    const b = conceptRepo.createConcept({ chapter_id: chapterId, description: 'B', unit: 'm' })
    conceptRepo.createConcept({ chapter_id: chapterId, description: 'C', unit: 'm' })

    conceptRepo.deleteConcept(b.id)

    const remaining = conceptRepo.getConcepts(chapterId)
    expect(remaining.map((c) => c.position)).toEqual([0, 1])
    expect(remaining.map((c) => c.description)).toEqual(['A', 'C'])
  })
})

// ─── reorderConcepts ──────────────────────────────────────────────────────────

describe('reorderConcepts', () => {
  it('reassigns positions according to the given order', () => {
    const a = conceptRepo.createConcept({ chapter_id: chapterId, description: 'A', unit: 'm' })
    const b = conceptRepo.createConcept({ chapter_id: chapterId, description: 'B', unit: 'm' })
    const c = conceptRepo.createConcept({ chapter_id: chapterId, description: 'C', unit: 'm' })

    const reordered = conceptRepo.reorderConcepts(chapterId, [c.id, a.id, b.id])

    expect(reordered.map((x) => x.description)).toEqual(['C', 'A', 'B'])
    expect(reordered.map((x) => x.position)).toEqual([0, 1, 2])
  })

  it('throws if id count does not match', () => {
    const a = conceptRepo.createConcept({ chapter_id: chapterId, description: 'A', unit: 'm' })
    conceptRepo.createConcept({ chapter_id: chapterId, description: 'B', unit: 'm' })

    expect(() => conceptRepo.reorderConcepts(chapterId, [a.id])).toThrow()
  })

  it('throws if an unknown id is included', () => {
    conceptRepo.createConcept({ chapter_id: chapterId, description: 'A', unit: 'm' })
    expect(() => conceptRepo.reorderConcepts(chapterId, ['id-desconocido'])).toThrow()
  })
})
