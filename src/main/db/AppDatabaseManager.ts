/**
 * AppDatabaseManager
 *
 * Manages the app-level SQLite database stored at:
 *   ~/.config/costcraft/app.db   (macOS / Linux)
 *   %APPDATA%\costcraft\app.db   (Windows)
 *
 * This database is separate from individual .presupuesto project files.
 * It stores application-level state that persists across projects:
 *   - recent_projects: list of recently opened/created project files
 *
 * Usage:
 *   const appDb = new AppDatabaseManager(app.getPath('userData'))
 *   appDb.open()
 *   const db = appDb.getDb()
 *   appDb.close()
 *
 * Design decisions:
 *   - Follows the same open/getDb/close pattern as DatabaseManager
 *     so the rest of the codebase stays consistent.
 *   - Uses a separate migration table (app_schema_migrations) to avoid
 *     any conflict if the file is ever inspected alongside project files.
 *   - Intentionally lightweight — no WAL mode needed for a single-writer
 *     app-level database, but we still enable foreign_keys and set a
 *     reasonable cache size.
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppMigration {
  version: number
  name: string
  up: string
}

// ─── Migrations ───────────────────────────────────────────────────────────────
//
// RULE: never modify an existing migration.
// To change the schema, add a new entry at the end with version + 1.

const APP_MIGRATIONS: AppMigration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Stores recently opened or created .presupuesto files.
      -- file_path is the unique key — each path appears at most once.
      CREATE TABLE IF NOT EXISTS recent_projects (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path     TEXT    NOT NULL UNIQUE,
        title         TEXT    NOT NULL,
        client        TEXT,
        last_opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_recent_projects_last_opened
        ON recent_projects (last_opened_at DESC);
    `
  }

  // ── Future migration example ─────────────────────────────────────────────
  // {
  //   version: 2,
  //   name: 'add_user_preferences',
  //   up: `
  //     CREATE TABLE IF NOT EXISTS user_preferences (
  //       key   TEXT PRIMARY KEY,
  //       value TEXT NOT NULL
  //     );
  //   `,
  // },
]

// ─── AppDatabaseManager ───────────────────────────────────────────────────────

export class AppDatabaseManager {
  private db: Database.Database | null = null
  private readonly dbPath: string

  /**
   * @param userDataDir - The Electron userData directory (app.getPath('userData')).
   *   The database file will be created at <userDataDir>/app.db.
   *   The directory is created automatically if it does not exist.
   */
  constructor(userDataDir: string) {
    if (!userDataDir || !userDataDir.trim()) {
      throw new Error('AppDatabaseManager: userDataDir cannot be empty.')
    }

    this.dbPath = path.join(path.resolve(userDataDir), 'app.db')
  }

  // ── Open ───────────────────────────────────────────────────────────────────

  /**
   * Opens the app database, creating the file and its parent directory if
   * they do not exist. Applies any pending migrations before returning.
   *
   * Throws if already open.
   */
  open(): void {
    if (this.db) {
      throw new Error('AppDatabaseManager: database is already open.')
    }

    // Ensure the userData directory exists before better-sqlite3 tries to
    // create the file — on a fresh install the directory may not yet exist.
    const dir = path.dirname(this.dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(this.dbPath)

    this.configurePragmas()
    this.ensureMigrationsTable()
    this.runPendingMigrations()
  }

  // ── Access ─────────────────────────────────────────────────────────────────

  /**
   * Returns the underlying better-sqlite3 Database instance.
   * Throws if open() has not been called first.
   */
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('AppDatabaseManager: call open() before using getDb().')
    }
    return this.db
  }

  get isOpen(): boolean {
    return this.db !== null && this.db.open
  }

  /** Absolute path to the app.db file. */
  get path(): string {
    return this.dbPath
  }

  // ── Close ──────────────────────────────────────────────────────────────────

  /**
   * Closes the connection cleanly.
   * Safe to call even if the database was never opened (no-op).
   */
  close(): void {
    if (this.db && this.db.open) {
      this.db.close()
    }
    this.db = null
  }

  // ── Pragmas ────────────────────────────────────────────────────────────────

  private configurePragmas(): void {
    const db = this.db!

    // Foreign key enforcement (good practice even if not currently used).
    db.pragma('foreign_keys = ON')

    // FULL sync for a small app-level database — data safety over speed.
    // The app.db is written infrequently (only on open/create), so the
    // performance cost is negligible.
    db.pragma('synchronous = FULL')

    // Small cache — the app.db holds only a handful of rows.
    db.pragma('cache_size = -1000')

    db.pragma('encoding = "UTF-8"')
  }

  // ── Migrations ─────────────────────────────────────────────────────────────

  private ensureMigrationsTable(): void {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS app_schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       TEXT    NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
  }

  private runPendingMigrations(): void {
    const db = this.db!

    const applied = new Set<number>(
      db
        .prepare('SELECT version FROM app_schema_migrations ORDER BY version')
        .pluck()
        .all() as number[]
    )

    const pending = APP_MIGRATIONS.filter((m) => !applied.has(m.version)).sort(
      (a, b) => a.version - b.version
    )

    if (pending.length === 0) return

    const insert = db.prepare('INSERT INTO app_schema_migrations (version, name) VALUES (?, ?)')

    for (const migration of pending) {
      console.log(
        `[AppDatabaseManager] Applying migration v${migration.version}: ${migration.name}`
      )

      db.transaction(() => {
        db.exec(migration.up)
        insert.run(migration.version, migration.name)
      })()
    }

    console.log(`[AppDatabaseManager] ${pending.length} migration(s) applied.`)
  }
}
