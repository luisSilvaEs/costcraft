/**
 * ExecutionRepository.test.ts
 *
 * Run:
 *   pnpm test src/main/db/repositories/ExecutionRepository.test.ts
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
import { ExecutionRepository } from './ExecutionRepository'

// ─── Setup ───────────────────────────────────────────────────────────────────

let tmpDir: string
let conceptRepo: ConceptRepository
let executionRepo: ExecutionRepository
let conceptId: string // quantity = 100

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'costcraft-test-'))
  const manager = new DatabaseManager(join(tmpDir, 'test.presupuesto'))
  manager.open()
  const db = manager.getDb()

  new ProjectRepository(db).createProject({ title: 'Proyecto Prueba' })
  const phaseId = new PhaseRepository(db).createPhase({ name: 'Fase 1' }).id
  const chapterId = new ChapterRepository(db).createChapter({ phase_id: phaseId, name: 'Cap A' }).id

  conceptRepo = new ConceptRepository(db)
  conceptId = conceptRepo.createConcept({
    chapter_id: chapterId,
    description: 'Excavación en roca',
    unit: 'm³',
    quantity: 100,
    unit_price: 320
  }).id

  executionRepo = new ExecutionRepository(db)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── addEntry ─────────────────────────────────────────────────────────────────

describe('addEntry', () => {
  it('creates an entry and returns the row', () => {
    const entry = executionRepo.addEntry({
      concept_id: conceptId,
      date: '2026-05-01',
      quantity_executed: 25
    })

    expect(entry.id).toBeTruthy()
    expect(entry.concept_id).toBe(conceptId)
    expect(entry.date).toBe('2026-05-01')
    expect(entry.quantity_executed).toBe(25)
    expect(entry.notes).toBeNull()
    expect(entry.created_at).toBeTruthy()
  })

  it('saves notes when provided', () => {
    const entry = executionRepo.addEntry({
      concept_id: conceptId,
      date: '2026-05-01',
      quantity_executed: 10,
      notes: 'Zona noreste completada'
    })

    expect(entry.notes).toBe('Zona noreste completada')
  })

  it('locks the concept on the first entry', () => {
    expect(conceptRepo.findById(conceptId)!.is_locked).toBe(0)

    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-01', quantity_executed: 10 })

    expect(conceptRepo.findById(conceptId)!.is_locked).toBe(1)
  })

  it('does not re-lock an already locked concept (idempotent)', () => {
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-01', quantity_executed: 10 })
    const lockedAt = conceptRepo.findById(conceptId)!.locked_at

    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-02', quantity_executed: 20 })

    // locked_at should not change on subsequent entries
    expect(conceptRepo.findById(conceptId)!.locked_at).toBe(lockedAt)
  })

  it('allows multiple entries for the same concept', () => {
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-01', quantity_executed: 25 })
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-08', quantity_executed: 30 })
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-15', quantity_executed: 20 })

    expect(executionRepo.getEntries(conceptId)).toHaveLength(3)
  })

  it('throws if concept does not exist', () => {
    expect(() =>
      executionRepo.addEntry({
        concept_id: 'id-fantasma',
        date: '2026-05-01',
        quantity_executed: 10
      })
    ).toThrow()
  })

  it('throws if quantity_executed is zero', () => {
    expect(() =>
      executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-01', quantity_executed: 0 })
    ).toThrow()
  })

  it('throws if quantity_executed is negative', () => {
    expect(() =>
      executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-01', quantity_executed: -5 })
    ).toThrow()
  })

  it('throws if date format is invalid', () => {
    expect(() =>
      executionRepo.addEntry({ concept_id: conceptId, date: '01/05/2026', quantity_executed: 10 })
    ).toThrow()

    expect(() =>
      executionRepo.addEntry({ concept_id: conceptId, date: '2026-5-1', quantity_executed: 10 })
    ).toThrow()
  })
})

// ─── getEntries ───────────────────────────────────────────────────────────────

describe('getEntries', () => {
  it('returns empty array when no entries exist', () => {
    expect(executionRepo.getEntries(conceptId)).toEqual([])
  })

  it('returns entries ordered by date ascending', () => {
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-15', quantity_executed: 10 })
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-01', quantity_executed: 25 })
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-08', quantity_executed: 30 })

    const dates = executionRepo.getEntries(conceptId).map((e) => e.date)
    expect(dates).toEqual(['2026-05-01', '2026-05-08', '2026-05-15'])
  })
})

// ─── getSummary ───────────────────────────────────────────────────────────────

describe('getSummary', () => {
  it('returns zeros before any entries', () => {
    const summary = executionRepo.getSummary(conceptId)

    expect(summary.quantity_budgeted).toBe(100)
    expect(summary.quantity_executed).toBe(0)
    expect(summary.quantity_remaining).toBe(100)
    expect(summary.progress_pct).toBe(0)
  })

  it('calculates progress correctly after entries', () => {
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-01', quantity_executed: 25 })
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-08', quantity_executed: 30 })

    const summary = executionRepo.getSummary(conceptId)

    expect(summary.quantity_executed).toBe(55)
    expect(summary.quantity_remaining).toBe(45)
    expect(summary.progress_pct).toBe(55)
  })

  it('handles 100% completion', () => {
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-01', quantity_executed: 100 })

    const summary = executionRepo.getSummary(conceptId)
    expect(summary.progress_pct).toBe(100)
    expect(summary.quantity_remaining).toBe(0)
  })

  it('handles over-execution (remaining goes negative)', () => {
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-01', quantity_executed: 120 })

    const summary = executionRepo.getSummary(conceptId)
    expect(summary.quantity_executed).toBe(120)
    expect(summary.quantity_remaining).toBe(-20)
    expect(summary.progress_pct).toBe(120)
  })

  it('returns progress_pct 100 when budgeted quantity is 0', () => {
    // Edge case: concept added with quantity = 0
    const chapterId = (conceptRepo as any).db
      .prepare('SELECT chapter_id FROM concepts WHERE id = ?')
      .get(conceptId).chapter_id

    const zeroQtyId = conceptRepo.createConcept({
      chapter_id: chapterId,
      description: 'Concepto sin cantidad',
      unit: 'pza',
      quantity: 0
    }).id

    const summary = executionRepo.getSummary(zeroQtyId)
    expect(summary.progress_pct).toBe(100)
  })

  it('throws if concept does not exist', () => {
    expect(() => executionRepo.getSummary('id-fantasma')).toThrow()
  })
})

// ─── deleteEntry ──────────────────────────────────────────────────────────────

describe('deleteEntry', () => {
  it('deletes an entry and returns true', () => {
    const entry = executionRepo.addEntry({
      concept_id: conceptId,
      date: '2026-05-01',
      quantity_executed: 25
    })

    expect(executionRepo.deleteEntry(entry.id)).toBe(true)
    expect(executionRepo.getEntries(conceptId)).toHaveLength(0)
  })

  it('returns false if entry does not exist', () => {
    expect(executionRepo.deleteEntry('id-fantasma')).toBe(false)
  })

  it('concept remains locked after all entries are deleted', () => {
    const entry = executionRepo.addEntry({
      concept_id: conceptId,
      date: '2026-05-01',
      quantity_executed: 25
    })

    executionRepo.deleteEntry(entry.id)

    // Lock must persist — no retroactive APU changes allowed
    expect(conceptRepo.findById(conceptId)!.is_locked).toBe(1)
  })

  it('summary reflects deletion — executed quantity decreases', () => {
    executionRepo.addEntry({ concept_id: conceptId, date: '2026-05-01', quantity_executed: 40 })
    const second = executionRepo.addEntry({
      concept_id: conceptId,
      date: '2026-05-08',
      quantity_executed: 30
    })

    executionRepo.deleteEntry(second.id)

    const summary = executionRepo.getSummary(conceptId)
    expect(summary.quantity_executed).toBe(40)
    expect(summary.progress_pct).toBe(40)
  })
})
