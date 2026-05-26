/**
 * RecentProjectsRepository
 *
 * CRUD for the `recent_projects` table in app.db.
 *
 * Responsibilities:
 *   - Record a project as recently opened (upsert by file_path).
 *   - Return the list of recent projects sorted by last_opened_at DESC.
 *   - Remove a single entry by file_path (e.g. user manually dismisses it).
 *   - Prune stale entries whose file no longer exists on disk.
 *   - Enforce a configurable maximum list length (default: 10).
 *
 * All methods are synchronous — better-sqlite3 is a sync driver and
 * the app.db is written infrequently, so there is no need for async here.
 */

import Database from 'better-sqlite3'
import fs from 'fs'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecentProjectRow {
  id: number
  file_path: string
  title: string
  client: string | null
  last_opened_at: string // ISO timestamp
}

export interface UpsertRecentProjectInput {
  file_path: string
  title: string
  client?: string | null
}

// ─── Repository ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_ENTRIES = 10

export class RecentProjectsRepository {
  private readonly db: Database.Database
  private readonly maxEntries: number

  constructor(db: Database.Database, maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.db = db
    this.maxEntries = maxEntries
  }

  // ── upsert ─────────────────────────────────────────────────────────────────

  /**
   * Inserts or updates a recent project entry.
   *
   * If the file_path already exists, updates title, client, and
   * last_opened_at so the entry floats to the top of the list.
   *
   * After upserting, trims the list to maxEntries by removing the
   * oldest entries (lowest last_opened_at).
   *
   * Throws if file_path or title is empty.
   */
  upsert(input: UpsertRecentProjectInput): RecentProjectRow {
    const { file_path, title, client = null } = input

    if (!file_path || !file_path.trim()) {
      throw new Error('RecentProjectsRepository.upsert: file_path is required.')
    }

    if (!title || !title.trim()) {
      throw new Error('RecentProjectsRepository.upsert: title is required.')
    }

    const now = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO recent_projects (file_path, title, client, last_opened_at)
         VALUES (@file_path, @title, @client, @now)
         ON CONFLICT (file_path) DO UPDATE SET
           title          = excluded.title,
           client         = excluded.client,
           last_opened_at = excluded.last_opened_at`
      )
      .run({ file_path: file_path.trim(), title: title.trim(), client, now })

    this.trimToMaxEntries()

    return this.findByPath(file_path.trim())!
  }

  // ── getAll ─────────────────────────────────────────────────────────────────

  /**
   * Returns all recent project entries sorted by last_opened_at DESC
   * (most recently opened first).
   *
   * Entries whose file_path no longer exists on disk are automatically
   * pruned before returning the list, so the UI never shows stale paths.
   */
  getAll(): RecentProjectRow[] {
    this.pruneStaleEntries()

    return this.db
      .prepare(
        `SELECT id, file_path, title, client, last_opened_at
           FROM recent_projects
          ORDER BY last_opened_at DESC`
      )
      .all() as RecentProjectRow[]
  }

  // ── remove ─────────────────────────────────────────────────────────────────

  /**
   * Removes a single entry by file_path.
   * Returns true if an entry was deleted, false if not found.
   */
  remove(file_path: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM recent_projects WHERE file_path = @file_path`)
      .run({ file_path })

    return result.changes > 0
  }

  // ── pruneStaleEntries ──────────────────────────────────────────────────────

  /**
   * Removes entries whose file no longer exists on disk.
   * Called automatically by getAll(), but can also be triggered manually
   * (e.g. on app startup after a system restart).
   *
   * Returns the number of entries removed.
   */
  pruneStaleEntries(): number {
    const all = this.db.prepare(`SELECT file_path FROM recent_projects`).pluck().all() as string[]

    const missing = all.filter((p) => !fs.existsSync(p))

    if (missing.length === 0) return 0

    const deleteStmt = this.db.prepare(`DELETE FROM recent_projects WHERE file_path = @file_path`)

    this.db.transaction(() => {
      for (const file_path of missing) {
        deleteStmt.run({ file_path })
      }
    })()

    return missing.length
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private findByPath(file_path: string): RecentProjectRow | null {
    const row = this.db
      .prepare(
        `SELECT id, file_path, title, client, last_opened_at
           FROM recent_projects
          WHERE file_path = @file_path`
      )
      .get({ file_path }) as RecentProjectRow | undefined

    return row ?? null
  }

  /**
   * Keeps the list at most maxEntries long by deleting the oldest entries
   * (those with the earliest last_opened_at).
   */
  private trimToMaxEntries(): void {
    const count = this.db.prepare(`SELECT COUNT(*) FROM recent_projects`).pluck().get() as number

    if (count <= this.maxEntries) return

    const excess = count - this.maxEntries

    this.db
      .prepare(
        `DELETE FROM recent_projects
          WHERE id IN (
            SELECT id FROM recent_projects
             ORDER BY last_opened_at ASC
             LIMIT @excess
          )`
      )
      .run({ excess })
  }
}
