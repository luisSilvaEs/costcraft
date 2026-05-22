/**
 * ProjectRepository
 *
 * CRUD for the `project_info` table.
 *
 * Design: each .presupuesto file holds exactly one project as a singleton row
 * with id = 1 enforced by a CHECK constraint. The repository reflects this:
 *   - createProject    → INSERT the singleton (fails if already exists)
 *   - getProjectInfo   → SELECT the singleton (returns null on a fresh file)
 *   - updateProjectInfo → UPDATE the singleton (no id argument needed)
 */

import Database from 'better-sqlite3'
import type { CreateProjectInput, UpdateProjectInput } from '../../../shared/types'

export interface ProjectInfoRow {
  id: number // always 1
  title: string
  description: string | null
  client: string | null
  created_at: string
  updated_at: string
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ProjectRepository {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  // ── createProject ──────────────────────────────────────────────────────────

  /**
   * Inserts the singleton project row (id = 1).
   * Throws if a project already exists in this file.
   * Throws if title is empty.
   */
  createProject(input: CreateProjectInput): ProjectInfoRow {
    const { title, description = null, client = null } = input

    if (!title || !title.trim()) {
      throw new Error('ProjectRepository.createProject: title is required.')
    }

    const now = new Date().toISOString()

    this.db
      .prepare(
        `INSERT INTO project_info (id, title, description, client, created_at, updated_at)
         VALUES (1, @title, @description, @client, @now, @now)`
      )
      .run({ title: title.trim(), description, client, now })

    return this.getProjectInfo()!
  }

  // ── getProjectInfo ─────────────────────────────────────────────────────────

  /**
   * Returns the project row, or null if the file is new and empty.
   */
  getProjectInfo(): ProjectInfoRow | null {
    const row = this.db.prepare(`SELECT * FROM project_info WHERE id = 1`).get() as
      | ProjectInfoRow
      | undefined

    return row ?? null
  }

  // ── updateProjectInfo ──────────────────────────────────────────────────────

  /**
   * Updates one or more fields of the singleton project.
   * Only the fields present in `input` are modified.
   * Throws if no project exists yet.
   * Throws if input is empty.
   */
  updateProjectInfo(input: UpdateProjectInput): ProjectInfoRow {
    const keys = Object.keys(input) as (keyof UpdateProjectInput)[]

    if (keys.length === 0) {
      throw new Error('ProjectRepository.updateProjectInfo: input must have at least one field.')
    }

    // Check existence before attempting UPDATE — SQLite UPDATE on missing rows
    // returns changes = 0 without throwing.
    const existing = this.getProjectInfo()
    if (!existing) {
      throw new Error(
        'ProjectRepository.updateProjectInfo: no project found. Call createProject first.'
      )
    }

    const setClauses = keys.map((k) => `${k} = @${k}`).join(', ')
    const now = new Date().toISOString()

    this.db
      .prepare(
        `UPDATE project_info
            SET ${setClauses}, updated_at = @updated_at
          WHERE id = 1`
      )
      .run({ ...input, updated_at: now })

    return this.getProjectInfo()!
  }
}
