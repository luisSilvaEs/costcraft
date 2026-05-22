/**
 * DatabaseManager
 *
 * Responsibilities:
 *  1. Open (or create) a .presupuesto file as a SQLite database.
 *  2. Run the initial schema on new files.
 *  3. Apply incremental migrations via the `schema_migrations` table.
 *  4. Expose the `Database` instance for repositories.
 *  5. Close the connection cleanly when switching projects or quitting the app.
 *
 * Usage:
 *   const db = new DatabaseManager('/path/to/project.presupuesto');
 *   db.open();                        // opens and migrates
 *   const raw = db.getDb();           // use better-sqlite3 directly
 *   db.close();
 */

import Database from 'better-sqlite3'
import path from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Migration {
  version: number // incremental integer: 1, 2, 3 …
  name: string // short snake_case description
  up: string // SQL to execute (can be multi-statement)
}

// ─── Migrations ───────────────────────────────────────────────────────────────
//
// RULE: never modify an existing migration.
// To change the schema, add a new entry at the end with version + 1.

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Project metadata (singleton row)
      CREATE TABLE IF NOT EXISTS project_info (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        title       TEXT    NOT NULL,
        description TEXT,
        client      TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Phases (top-level work divisions)
      CREATE TABLE IF NOT EXISTS phases (
        id          TEXT PRIMARY KEY,
        project_id  INTEGER NOT NULL REFERENCES project_info(id) ON DELETE CASCADE,
        code        TEXT,
        name        TEXT NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Chapters within a phase
      CREATE TABLE IF NOT EXISTS chapters (
        id          TEXT PRIMARY KEY,
        phase_id    TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
        code        TEXT,
        name        TEXT NOT NULL,
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Concepts (work line items)
      CREATE TABLE IF NOT EXISTS concepts (
        id                  TEXT PRIMARY KEY,
        chapter_id          TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        code                TEXT,
        description         TEXT NOT NULL,
        unit                TEXT NOT NULL,
        quantity            REAL NOT NULL DEFAULT 0,
        unit_price          REAL NOT NULL DEFAULT 0,
        is_locked           INTEGER NOT NULL DEFAULT 0, -- 1 = locked after first execution entry
        locked_at           TIMESTAMP,
        position            INTEGER NOT NULL DEFAULT 0,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- APU components per concept
      CREATE TABLE IF NOT EXISTS apu_components (
        id              TEXT PRIMARY KEY,
        concept_id      TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
        type            TEXT NOT NULL CHECK (type IN ('material', 'labor', 'equipment', 'subcontract')),
        description     TEXT NOT NULL,
        unit            TEXT NOT NULL,
        quantity        REAL NOT NULL DEFAULT 0,
        unit_price      REAL NOT NULL DEFAULT 0,
        price_source    TEXT CHECK (price_source IN ('manual', 'catalog', 'inegi')),
        catalog_item_id TEXT,           -- soft FK to price catalog
        position        INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Project price catalog (base prices entered manually)
      CREATE TABLE IF NOT EXISTS price_catalog (
        id          TEXT PRIMARY KEY,
        code        TEXT,
        description TEXT NOT NULL,
        unit        TEXT NOT NULL,
        price       REAL NOT NULL DEFAULT 0,
        type        TEXT NOT NULL CHECK (type IN ('material', 'labor', 'equipment', 'subcontract')),
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Cached INPP/INPC indices for cost escalation
      CREATE TABLE IF NOT EXISTS inpp_indices (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        series_id   TEXT NOT NULL,
        series_name TEXT NOT NULL,
        period      TEXT NOT NULL,   -- format YYYY/MM
        value       REAL NOT NULL,
        fetched_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(series_id, period)
      );

      -- Execution log (real progress against budget)
      CREATE TABLE IF NOT EXISTS execution_log (
        id                TEXT PRIMARY KEY,
        concept_id        TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
        date              DATE NOT NULL,
        quantity_executed REAL NOT NULL DEFAULT 0,
        notes             TEXT,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for frequent queries
      CREATE INDEX IF NOT EXISTS idx_phases_project    ON phases(project_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_phase    ON chapters(phase_id);
      CREATE INDEX IF NOT EXISTS idx_concepts_chapter  ON concepts(chapter_id);
      CREATE INDEX IF NOT EXISTS idx_apu_concept       ON apu_components(concept_id);
      CREATE INDEX IF NOT EXISTS idx_execution_concept ON execution_log(concept_id);
      CREATE INDEX IF NOT EXISTS idx_inpp_series       ON inpp_indices(series_id, period);
      CREATE INDEX IF NOT EXISTS idx_catalog_type      ON price_catalog(type);
    `
  }

  // ── Future migration example ───────────────────────────────────────────────
  // {
  //   version: 2,
  //   name: 'add_concept_notes',
  //   up: `ALTER TABLE concepts ADD COLUMN notes TEXT;`,
  // },
]

// ─── DatabaseManager ──────────────────────────────────────────────────────────

export class DatabaseManager {
  private db: Database.Database | null = null
  private readonly filePath: string

  constructor(filePath: string) {
    if (!filePath || !filePath.trim()) {
      throw new Error('DatabaseManager: filePath cannot be empty.')
    }
    this.filePath = path.resolve(filePath)
  }

  // ── Open ─────────────────────────────────────────────────────────────────────

  /**
   * Opens the SQLite file, configures pragmas, and applies pending migrations.
   * If the file does not exist, better-sqlite3 creates it automatically.
   */
  open(): void {
    if (this.db) {
      throw new Error('DatabaseManager: database is already open.')
    }

    this.db = new Database(this.filePath, {
      // verbose: console.log,  // uncomment to log all queries
    })

    this.configurePragmas()
    this.ensureMigrationsTable()
    this.runPendingMigrations()
  }

  // ── Access ───────────────────────────────────────────────────────────────────

  /**
   * Returns the `better-sqlite3` instance for use in repositories.
   * Throws if `open()` has not been called first.
   */
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('DatabaseManager: call open() before using getDb().')
    }
    return this.db
  }

  get isOpen(): boolean {
    return this.db !== null && this.db.open
  }

  get path(): string {
    return this.filePath
  }

  // ── Close ────────────────────────────────────────────────────────────────────

  /**
   * Closes the connection cleanly.
   * Call this when switching projects or quitting the app.
   */
  close(): void {
    if (this.db && this.db.open) {
      this.db.close()
    }
    this.db = null
  }

  // ── Pragmas ──────────────────────────────────────────────────────────────────

  private configurePragmas(): void {
    const db = this.db!

    // WAL mode: reads and writes do not block each other.
    db.pragma('journal_mode = WAL')

    // Enforce foreign keys (SQLite ignores them by default).
    db.pragma('foreign_keys = ON')

    // NORMAL sync: good safety/performance balance in WAL mode.
    db.pragma('synchronous = NORMAL')

    // 8 MB cache for queries on large projects.
    db.pragma('cache_size = -8000')

    // Explicit UTF-8 encoding (especially relevant on Windows).
    db.pragma('encoding = "UTF-8"')
  }

  // ── Migrations ───────────────────────────────────────────────────────────────

  /**
   * Creates the migrations control table if it does not exist.
   * Must be called before `runPendingMigrations`.
   */
  private ensureMigrationsTable(): void {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       TEXT    NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)
  }

  /**
   * Determines which migrations have already been applied and runs any pending
   * ones, each inside its own atomic transaction.
   */
  private runPendingMigrations(): void {
    const db = this.db!

    const appliedVersions = new Set<number>(
      db.prepare('SELECT version FROM schema_migrations ORDER BY version').pluck().all() as number[]
    )

    const pending = MIGRATIONS.filter((m) => !appliedVersions.has(m.version)).sort(
      (a, b) => a.version - b.version
    )

    if (pending.length === 0) return

    const insertMigration = db.prepare(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)'
    )

    for (const migration of pending) {
      console.log(`[DatabaseManager] Applying migration v${migration.version}: ${migration.name}`)

      // Each migration is atomic: if it fails, the file is left unchanged.
      db.transaction(() => {
        db.exec(migration.up)
        insertMigration.run(migration.version, migration.name)
      })()
    }

    console.log(`[DatabaseManager] ${pending.length} migration(s) applied successfully.`)
  }
}
