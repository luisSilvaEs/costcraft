/**
 * ChapterRepository.test.ts
 *
 * Run:
 *   pnpm test src/main/db/repositories/ChapterRepository.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { DatabaseManager } from '../DatabaseManager'
import { ProjectRepository } from './ProjectRepository'
import { PhaseRepository } from './PhaseRepository'
import { ChapterRepository } from './ChapterRepository'

// ─── Setup ───────────────────────────────────────────────────────────────────

let tmpDir: string
let chapterRepo: ChapterRepository
let phaseId: string // default phase used across most tests
let altPhaseId: string // second phase for cross-phase tests

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'costcraft-test-'))
  const manager = new DatabaseManager(join(tmpDir, 'test.presupuesto'))
  manager.open()
  const db = manager.getDb()

  new ProjectRepository(db).createProject({ title: 'Proyecto Prueba' })

  const phaseRepo = new PhaseRepository(db)
  phaseId = phaseRepo.createPhase({ name: 'Fase Principal' }).id
  altPhaseId = phaseRepo.createPhase({ name: 'Fase Secundaria' }).id

  chapterRepo = new ChapterRepository(db)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── createChapter ────────────────────────────────────────────────────────────

describe('createChapter', () => {
  it('creates a chapter and returns the row', () => {
    const chapter = chapterRepo.createChapter({ phase_id: phaseId, name: 'Movimiento de Tierras' })

    expect(chapter.id).toBeTruthy()
    expect(chapter.name).toBe('Movimiento de Tierras')
    expect(chapter.phase_id).toBe(phaseId)
    expect(chapter.code).toBeNull()
    expect(chapter.position).toBe(0)
  })

  it('saves code when provided', () => {
    const chapter = chapterRepo.createChapter({
      phase_id: phaseId,
      name: 'Pavimentos',
      code: 'PAV-01'
    })
    expect(chapter.code).toBe('PAV-01')
  })

  it('trims whitespace from name', () => {
    const chapter = chapterRepo.createChapter({ phase_id: phaseId, name: '  Drenaje  ' })
    expect(chapter.name).toBe('Drenaje')
  })

  it('assigns sequential positions within the same phase', () => {
    const a = chapterRepo.createChapter({ phase_id: phaseId, name: 'A' })
    const b = chapterRepo.createChapter({ phase_id: phaseId, name: 'B' })
    const c = chapterRepo.createChapter({ phase_id: phaseId, name: 'C' })

    expect(a.position).toBe(0)
    expect(b.position).toBe(1)
    expect(c.position).toBe(2)
  })

  it('positions are scoped per phase — each phase starts at 0', () => {
    chapterRepo.createChapter({ phase_id: phaseId, name: 'Cap A' })
    chapterRepo.createChapter({ phase_id: phaseId, name: 'Cap B' })

    // Different phase: should start at position 0 regardless
    const first = chapterRepo.createChapter({ phase_id: altPhaseId, name: 'Cap X' })
    expect(first.position).toBe(0)
  })

  it('throws if name is empty', () => {
    expect(() => chapterRepo.createChapter({ phase_id: phaseId, name: '' })).toThrow()
    expect(() => chapterRepo.createChapter({ phase_id: phaseId, name: '   ' })).toThrow()
  })

  it('throws if phase does not exist', () => {
    expect(() => chapterRepo.createChapter({ phase_id: 'id-fantasma', name: 'Capitulo' })).toThrow()
  })
})

// ─── getChapters ─────────────────────────────────────────────────────────────

describe('getChapters', () => {
  it('returns empty array for a phase with no chapters', () => {
    expect(chapterRepo.getChapters(phaseId)).toEqual([])
  })

  it('returns only chapters belonging to the requested phase', () => {
    chapterRepo.createChapter({ phase_id: phaseId, name: 'Cap Fase 1' })
    chapterRepo.createChapter({ phase_id: altPhaseId, name: 'Cap Fase 2' })

    const result = chapterRepo.getChapters(phaseId)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Cap Fase 1')
  })

  it('returns chapters ordered by position', () => {
    chapterRepo.createChapter({ phase_id: phaseId, name: 'Primero' })
    chapterRepo.createChapter({ phase_id: phaseId, name: 'Segundo' })
    chapterRepo.createChapter({ phase_id: phaseId, name: 'Tercero' })

    const names = chapterRepo.getChapters(phaseId).map((c) => c.name)
    expect(names).toEqual(['Primero', 'Segundo', 'Tercero'])
  })
})

// ─── updateChapter ────────────────────────────────────────────────────────────

describe('updateChapter', () => {
  it('updates name', () => {
    const chapter = chapterRepo.createChapter({ phase_id: phaseId, name: 'Viejo' })
    const updated = chapterRepo.updateChapter(chapter.id, { name: 'Nuevo' })
    expect(updated.name).toBe('Nuevo')
  })

  it('updates code without touching other fields', () => {
    const chapter = chapterRepo.createChapter({
      phase_id: phaseId,
      name: 'Capítulo',
      code: 'CAP-01'
    })
    const updated = chapterRepo.updateChapter(chapter.id, { code: 'CAP-02' })

    expect(updated.code).toBe('CAP-02')
    expect(updated.name).toBe('Capítulo')
    expect(updated.position).toBe(chapter.position)
  })

  it('throws if chapter does not exist', () => {
    expect(() => chapterRepo.updateChapter('id-fantasma', { name: 'X' })).toThrow()
  })

  it('throws if input is empty', () => {
    const chapter = chapterRepo.createChapter({ phase_id: phaseId, name: 'Cap' })
    expect(() => chapterRepo.updateChapter(chapter.id, {})).toThrow()
  })
})

// ─── deleteChapter ────────────────────────────────────────────────────────────

describe('deleteChapter', () => {
  it('deletes a chapter and returns true', () => {
    const chapter = chapterRepo.createChapter({ phase_id: phaseId, name: 'Para Borrar' })
    expect(chapterRepo.deleteChapter(chapter.id)).toBe(true)
    expect(chapterRepo.getChapters(phaseId)).toHaveLength(0)
  })

  it('returns false if chapter does not exist', () => {
    expect(chapterRepo.deleteChapter('id-fantasma')).toBe(false)
  })

  it('compacts positions after deletion', () => {
    chapterRepo.createChapter({ phase_id: phaseId, name: 'A' })
    const b = chapterRepo.createChapter({ phase_id: phaseId, name: 'B' })
    chapterRepo.createChapter({ phase_id: phaseId, name: 'C' })

    chapterRepo.deleteChapter(b.id)

    const remaining = chapterRepo.getChapters(phaseId)
    expect(remaining.map((c) => c.position)).toEqual([0, 1])
    expect(remaining.map((c) => c.name)).toEqual(['A', 'C'])
  })

  it('only compacts positions within the same phase', () => {
    const a = chapterRepo.createChapter({ phase_id: phaseId, name: 'A' })
    const b = chapterRepo.createChapter({ phase_id: phaseId, name: 'B' })
    chapterRepo.createChapter({ phase_id: altPhaseId, name: 'X' })
    chapterRepo.createChapter({ phase_id: altPhaseId, name: 'Y' })

    chapterRepo.deleteChapter(a.id)

    // phaseId: only B remains at position 0
    expect(chapterRepo.getChapters(phaseId).map((c) => c.position)).toEqual([0])

    // altPhaseId: untouched — X at 0, Y at 1
    expect(chapterRepo.getChapters(altPhaseId).map((c) => c.position)).toEqual([0, 1])
  })
})

// ─── reorderChapters ─────────────────────────────────────────────────────────

describe('reorderChapters', () => {
  it('reassigns positions according to the given order', () => {
    const a = chapterRepo.createChapter({ phase_id: phaseId, name: 'A' })
    const b = chapterRepo.createChapter({ phase_id: phaseId, name: 'B' })
    const c = chapterRepo.createChapter({ phase_id: phaseId, name: 'C' })

    const reordered = chapterRepo.reorderChapters(phaseId, [c.id, a.id, b.id])

    expect(reordered.map((ch) => ch.name)).toEqual(['C', 'A', 'B'])
    expect(reordered.map((ch) => ch.position)).toEqual([0, 1, 2])
  })

  it('throws if id count does not match', () => {
    const a = chapterRepo.createChapter({ phase_id: phaseId, name: 'A' })
    chapterRepo.createChapter({ phase_id: phaseId, name: 'B' })

    expect(() => chapterRepo.reorderChapters(phaseId, [a.id])).toThrow()
  })

  it('throws if an unknown id is included', () => {
    chapterRepo.createChapter({ phase_id: phaseId, name: 'A' })
    expect(() => chapterRepo.reorderChapters(phaseId, ['id-desconocido'])).toThrow()
  })

  it('does not affect chapters in other phases', () => {
    const a = chapterRepo.createChapter({ phase_id: phaseId, name: 'A' })
    const b = chapterRepo.createChapter({ phase_id: phaseId, name: 'B' })
    chapterRepo.createChapter({ phase_id: altPhaseId, name: 'X' })
    chapterRepo.createChapter({ phase_id: altPhaseId, name: 'Y' })

    chapterRepo.reorderChapters(phaseId, [b.id, a.id])

    // altPhaseId chapters are untouched
    const alt = chapterRepo.getChapters(altPhaseId)
    expect(alt.map((c) => c.name)).toEqual(['X', 'Y'])
  })
})
