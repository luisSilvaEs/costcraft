/**
 * ProjectRepository.test.ts
 *
 * Each test uses a unique temp file so better-sqlite3 gets a truly fresh
 * connection — :memory: can share state across tests in Vitest 4.
 *
 * Run:
 *   pnpm test src/main/db/repositories/ProjectRepository.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { DatabaseManager } from '../DatabaseManager'
import { ProjectRepository } from './ProjectRepository'

// ─── Setup ───────────────────────────────────────────────────────────────────

let tmpDir: string
let repo: ProjectRepository

beforeEach(() => {
  // Unique temp file per test → guaranteed isolation
  tmpDir = mkdtempSync(join(tmpdir(), 'costcraft-test-'))
  const manager = new DatabaseManager(join(tmpDir, 'test.presupuesto'))
  manager.open()
  repo = new ProjectRepository(manager.getDb())
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── createProject ────────────────────────────────────────────────────────────

describe('createProject', () => {
  it('creates the singleton row and returns it', () => {
    const project = repo.createProject({ title: 'Carretera Federal km 12-18' })

    expect(project.id).toBe(1)
    expect(project.title).toBe('Carretera Federal km 12-18')
    expect(project.description).toBeNull()
    expect(project.client).toBeNull()
    expect(project.created_at).toBeTruthy()
    expect(project.updated_at).toBeTruthy()
  })

  it('trims whitespace from title', () => {
    const project = repo.createProject({ title: '  Edificio Oaxaca  ' })
    expect(project.title).toBe('Edificio Oaxaca')
  })

  it('saves description and client when provided', () => {
    const project = repo.createProject({
      title: 'Puente Necaxa',
      description: 'Paso vehicular',
      client: 'SCT'
    })

    expect(project.description).toBe('Paso vehicular')
    expect(project.client).toBe('SCT')
  })

  it('throws if title is empty', () => {
    expect(() => repo.createProject({ title: '' })).toThrow()
    expect(() => repo.createProject({ title: '   ' })).toThrow()
  })

  it('throws if called twice (singleton constraint)', () => {
    repo.createProject({ title: 'Primer Proyecto' })
    expect(() => repo.createProject({ title: 'Segundo Proyecto' })).toThrow()
  })
})

// ─── getProjectInfo ───────────────────────────────────────────────────────────

describe('getProjectInfo', () => {
  it('returns null on a fresh file', () => {
    expect(repo.getProjectInfo()).toBeNull()
  })

  it('returns the project after creating it', () => {
    repo.createProject({ title: 'Mi Obra' })

    const info = repo.getProjectInfo()
    expect(info).not.toBeNull()
    expect(info!.title).toBe('Mi Obra')
  })
})

// ─── updateProjectInfo ────────────────────────────────────────────────────────

describe('updateProjectInfo', () => {
  it('updates title and refreshes updated_at', async () => {
    repo.createProject({ title: 'Nombre Viejo' })
    const original = repo.getProjectInfo()!

    await new Promise((r) => setTimeout(r, 2))

    const updated = repo.updateProjectInfo({ title: 'Nombre Nuevo' })

    expect(updated.title).toBe('Nombre Nuevo')
    expect(updated.updated_at).not.toBe(original.updated_at)
    expect(updated.client).toBe(original.client)
  })

  it('updates multiple fields in one call', () => {
    repo.createProject({ title: 'Proyecto X' })

    const updated = repo.updateProjectInfo({
      title: 'Proyecto Y',
      client: 'CAPUFE',
      description: 'Libramiento norte'
    })

    expect(updated.title).toBe('Proyecto Y')
    expect(updated.client).toBe('CAPUFE')
    expect(updated.description).toBe('Libramiento norte')
  })

  it('throws if no project exists yet', () => {
    expect(() => repo.updateProjectInfo({ title: 'Algo' })).toThrow()
  })

  it('throws if input is empty', () => {
    repo.createProject({ title: 'Obra' })
    expect(() => repo.updateProjectInfo({})).toThrow()
  })
})
