/**
 * PhaseRepository.test.ts
 *
 * Run:
 *   pnpm test src/main/db/repositories/PhaseRepository.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { DatabaseManager } from '../DatabaseManager'
import { ProjectRepository } from './ProjectRepository'
import { PhaseRepository } from './PhaseRepository'

// ─── Setup ───────────────────────────────────────────────────────────────────

let tmpDir: string
let phaseRepo: PhaseRepository

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'costcraft-test-'))
  const manager = new DatabaseManager(join(tmpDir, 'test.presupuesto'))
  manager.open()
  const db = manager.getDb()

  // PhaseRepository requires a project to exist (FK project_id = 1)
  new ProjectRepository(db).createProject({ title: 'Proyecto de Prueba' })
  phaseRepo = new PhaseRepository(db)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── createPhase ─────────────────────────────────────────────────────────────

describe('createPhase', () => {
  it('creates a phase and returns the row', () => {
    const phase = phaseRepo.createPhase({ name: 'Terracerías' })

    expect(phase.id).toBeTruthy()
    expect(phase.name).toBe('Terracerías')
    expect(phase.code).toBeNull()
    expect(phase.project_id).toBe(1)
    expect(phase.position).toBe(0)
  })

  it('saves code when provided', () => {
    const phase = phaseRepo.createPhase({ name: 'Pavimentos', code: 'PAV' })
    expect(phase.code).toBe('PAV')
  })

  it('trims whitespace from name', () => {
    const phase = phaseRepo.createPhase({ name: '  Drenaje  ' })
    expect(phase.name).toBe('Drenaje')
  })

  it('assigns sequential positions', () => {
    const a = phaseRepo.createPhase({ name: 'Fase A' })
    const b = phaseRepo.createPhase({ name: 'Fase B' })
    const c = phaseRepo.createPhase({ name: 'Fase C' })

    expect(a.position).toBe(0)
    expect(b.position).toBe(1)
    expect(c.position).toBe(2)
  })

  it('throws if name is empty', () => {
    expect(() => phaseRepo.createPhase({ name: '' })).toThrow()
    expect(() => phaseRepo.createPhase({ name: '   ' })).toThrow()
  })
})

// ─── getPhases ────────────────────────────────────────────────────────────────

describe('getPhases', () => {
  it('returns empty array on a fresh project', () => {
    expect(phaseRepo.getPhases()).toEqual([])
  })

  it('returns phases ordered by position', () => {
    phaseRepo.createPhase({ name: 'Primera' })
    phaseRepo.createPhase({ name: 'Segunda' })
    phaseRepo.createPhase({ name: 'Tercera' })

    const phases = phaseRepo.getPhases()
    expect(phases.map((p) => p.name)).toEqual(['Primera', 'Segunda', 'Tercera'])
  })
})

// ─── updatePhase ─────────────────────────────────────────────────────────────

describe('updatePhase', () => {
  it('updates name', () => {
    const phase = phaseRepo.createPhase({ name: 'Viejo Nombre' })
    const updated = phaseRepo.updatePhase(phase.id, { name: 'Nuevo Nombre' })
    expect(updated.name).toBe('Nuevo Nombre')
  })

  it('updates code', () => {
    const phase = phaseRepo.createPhase({ name: 'Terracerías' })
    const updated = phaseRepo.updatePhase(phase.id, { code: 'TER' })
    expect(updated.code).toBe('TER')
  })

  it('does not touch position or other fields', () => {
    const phase = phaseRepo.createPhase({ name: 'Fase', code: 'F1' })
    const updated = phaseRepo.updatePhase(phase.id, { name: 'Fase Actualizada' })

    expect(updated.position).toBe(phase.position)
    expect(updated.code).toBe('F1')
  })

  it('throws if phase does not exist', () => {
    expect(() => phaseRepo.updatePhase('id-fantasma', { name: 'X' })).toThrow()
  })

  it('throws if input is empty', () => {
    const phase = phaseRepo.createPhase({ name: 'Fase' })
    expect(() => phaseRepo.updatePhase(phase.id, {})).toThrow()
  })
})

// ─── deletePhase ─────────────────────────────────────────────────────────────

describe('deletePhase', () => {
  it('deletes a phase and returns true', () => {
    const phase = phaseRepo.createPhase({ name: 'Para Borrar' })
    expect(phaseRepo.deletePhase(phase.id)).toBe(true)
    expect(phaseRepo.getPhases()).toHaveLength(0)
  })

  it('returns false if phase does not exist', () => {
    expect(phaseRepo.deletePhase('id-fantasma')).toBe(false)
  })

  it('compacts positions after deletion', () => {
    phaseRepo.createPhase({ name: 'A' })
    const b = phaseRepo.createPhase({ name: 'B' })
    phaseRepo.createPhase({ name: 'C' })

    phaseRepo.deletePhase(b.id)

    const remaining = phaseRepo.getPhases()
    expect(remaining.map((p) => p.position)).toEqual([0, 1])
    expect(remaining.map((p) => p.name)).toEqual(['A', 'C'])
  })
})

// ─── reorderPhases ───────────────────────────────────────────────────────────

describe('reorderPhases', () => {
  it('reassigns positions according to the given order', () => {
    const a = phaseRepo.createPhase({ name: 'A' })
    const b = phaseRepo.createPhase({ name: 'B' })
    const c = phaseRepo.createPhase({ name: 'C' })

    const reordered = phaseRepo.reorderPhases([c.id, a.id, b.id])

    expect(reordered.map((p) => p.name)).toEqual(['C', 'A', 'B'])
    expect(reordered.map((p) => p.position)).toEqual([0, 1, 2])
  })

  it('throws if id count does not match', () => {
    const a = phaseRepo.createPhase({ name: 'A' })
    phaseRepo.createPhase({ name: 'B' })

    expect(() => phaseRepo.reorderPhases([a.id])).toThrow()
  })

  it('throws if an unknown id is included', () => {
    phaseRepo.createPhase({ name: 'A' })
    expect(() => phaseRepo.reorderPhases(['id-desconocido'])).toThrow()
  })
})
