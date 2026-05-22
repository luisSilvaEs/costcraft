/**
 * DatabaseManager.test.ts
 *
 * Pruebas con Vitest. Corren en el proceso de Node.js directamente
 * (no en Electron), por lo que pueden importar better-sqlite3 sin problema.
 *
 * Para correrlas:
 *   pnpm test                     → watch mode
 *   pnpm test --run               → single run (CI)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { DatabaseManager } from './DatabaseManager'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Crea un path temporal único para cada test; borra el archivo al limpiar. */
function tempDbPath(): string {
  return path.join(
    os.tmpdir(),
    `costcraft-test-${Date.now()}-${Math.random().toString(36).slice(2)}.presupuesto`
  )
}

function deleteSilently(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch {
    /* no existe */
  }
  // WAL genera dos archivos auxiliares
  try {
    fs.unlinkSync(filePath + '-wal')
  } catch {
    /* ok */
  }
  try {
    fs.unlinkSync(filePath + '-shm')
  } catch {
    /* ok */
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DatabaseManager', () => {
  let dbPath: string
  let manager: DatabaseManager

  beforeEach(() => {
    dbPath = tempDbPath()
    manager = new DatabaseManager(dbPath)
  })

  afterEach(() => {
    manager.close()
    deleteSilently(dbPath)
  })

  // ── Constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('lanza si filePath está vacío', () => {
      expect(() => new DatabaseManager('')).toThrow()
    })

    it('lanza si filePath es solo espacios', () => {
      expect(() => new DatabaseManager('   ')).toThrow()
    })

    it('acepta un path válido sin abrir el archivo todavía', () => {
      // El archivo no debe existir aún (open() no fue llamado)
      expect(fs.existsSync(dbPath)).toBe(false)
    })
  })

  // ── open() ─────────────────────────────────────────────────────────────────

  describe('open()', () => {
    it('crea el archivo .presupuesto en disco', () => {
      manager.open()
      expect(fs.existsSync(dbPath)).toBe(true)
    })

    it('lanza si se llama dos veces seguidas', () => {
      manager.open()
      expect(() => manager.open()).toThrow()
    })

    it('isOpen es true después de open()', () => {
      manager.open()
      expect(manager.isOpen).toBe(true)
    })

    it('isOpen es false antes de open()', () => {
      expect(manager.isOpen).toBe(false)
    })
  })

  // ── getDb() ────────────────────────────────────────────────────────────────

  describe('getDb()', () => {
    it('lanza si se llama antes de open()', () => {
      expect(() => manager.getDb()).toThrow()
    })

    it('devuelve una instancia de Database válida después de open()', () => {
      manager.open()
      const db = manager.getDb()
      expect(db).toBeDefined()
      expect(db.open).toBe(true)
    })
  })

  // ── close() ────────────────────────────────────────────────────────────────

  describe('close()', () => {
    it('cierra la conexión limpiamente', () => {
      manager.open()
      manager.close()
      expect(manager.isOpen).toBe(false)
    })

    it('es idempotente: se puede llamar varias veces sin error', () => {
      manager.open()
      expect(() => {
        manager.close()
        manager.close()
      }).not.toThrow()
    })
  })

  // ── Schema (tablas creadas por la migración v1) ────────────────────────────

  describe('schema inicial (migración v1)', () => {
    const expectedTables = [
      'project_info',
      'phases',
      'chapters',
      'concepts',
      'apu_components',
      'price_catalog',
      'inpp_indices',
      'execution_log',
      'schema_migrations'
    ]

    it.each(expectedTables)('crea la tabla "%s"', (tableName) => {
      manager.open()
      const db = manager.getDb()
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName)
      expect(row).toBeDefined()
    })

    it('activa foreign keys', () => {
      manager.open()
      const db = manager.getDb()
      const result = db.pragma('foreign_keys', { simple: true })
      expect(result).toBe(1)
    })

    it('usa WAL journal mode', () => {
      manager.open()
      const db = manager.getDb()
      const mode = db.pragma('journal_mode', { simple: true })
      expect(mode).toBe('wal')
    })
  })

  // ── Migrations ─────────────────────────────────────────────────────────────

  describe('sistema de migraciones', () => {
    it('registra la migración v1 en schema_migrations', () => {
      manager.open()
      const db = manager.getDb()
      const row = db.prepare('SELECT * FROM schema_migrations WHERE version = 1').get() as
        | { version: number; name: string }
        | undefined

      expect(row).toBeDefined()
      expect(row!.version).toBe(1)
      expect(row!.name).toBe('initial_schema')
    })

    it('NO vuelve a aplicar migraciones ya aplicadas al reabrir el archivo', () => {
      // Primera apertura: aplica v1
      manager.open()
      manager.close()

      // Segunda apertura: no debe volver a insertar en schema_migrations
      const manager2 = new DatabaseManager(dbPath)
      manager2.open()
      const db = manager2.getDb()

      const count = db
        .prepare('SELECT COUNT(*) as n FROM schema_migrations')
        .pluck()
        .get() as number

      manager2.close()
      expect(count).toBe(1) // solo v1, sin duplicados
    })
  })

  // ── path ───────────────────────────────────────────────────────────────────

  describe('propiedad path', () => {
    it('devuelve el path absoluto resuelto', () => {
      const relPath = './test.presupuesto'
      const m = new DatabaseManager(relPath)
      expect(path.isAbsolute(m.path)).toBe(true)
      m.close()
    })
  })

  // ── Integridad referencial ─────────────────────────────────────────────────

  describe('integridad referencial', () => {
    it('impide insertar un phase con project_id inexistente', () => {
      manager.open()
      const db = manager.getDb()

      expect(() => {
        db.prepare(
          `
          INSERT INTO phases (id, project_id, name, position)
          VALUES ('ph-1', 99, 'Terracerías', 0)
        `
        ).run()
      }).toThrow()
    })

    it('permite insertar una phase con project_id válido', () => {
      manager.open()
      const db = manager.getDb()

      db.prepare(
        `
        INSERT INTO project_info (id, title) VALUES (1, 'Obra Prueba')
      `
      ).run()

      expect(() => {
        db.prepare(
          `
          INSERT INTO phases (id, project_id, name, position)
          VALUES ('ph-1', 1, 'Terracerías', 0)
        `
        ).run()
      }).not.toThrow()
    })
  })
})
