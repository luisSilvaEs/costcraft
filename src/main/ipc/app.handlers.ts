/**
 * app.handlers.ts
 *
 * IPC handlers for app-level operations that are not tied to a specific
 * project file. These handlers interact with app.db via RecentProjectsRepository.
 *
 * Channels registered:
 *   app:get-recent-projects   — returns the list of recently opened projects
 *   app:remove-recent-project — removes a single entry from the recent list
 *   app:prune-recent-projects — removes entries whose file no longer exists
 */

import { ipcMain } from 'electron'
import { RecentProjectsRepository } from '../db/repositories/RecentProjectsRepository'
import type { AppDatabaseManager } from '../db/AppDatabaseManager'

// ─── State ────────────────────────────────────────────────────────────────────
//
// The AppDatabaseManager instance is created in src/main/index.ts and passed
// here at startup. We keep a module-level reference so all handlers share
// the same open connection.

let _appManager: AppDatabaseManager | null = null

/**
 * Called once from src/main/index.ts after AppDatabaseManager.open().
 * Must be called before registerAppHandlers().
 */
export function setAppManager(manager: AppDatabaseManager): void {
  _appManager = manager
}

function getRecentRepo(): RecentProjectsRepository {
  if (!_appManager) {
    throw new Error('app.handlers: AppDatabaseManager has not been initialized.')
  }
  return new RecentProjectsRepository(_appManager.getDb())
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerAppHandlers(): void {
  // ── app:get-recent-projects ────────────────────────────────────────────────
  //
  // Returns the list of recently opened/created projects sorted by
  // last_opened_at DESC. Stale entries (deleted files) are pruned automatically
  // before returning.
  //
  // Returns: RecentProjectRow[]

  ipcMain.handle('app:get-recent-projects', () => {
    return getRecentRepo().getAll()
  })

  // ── app:remove-recent-project ──────────────────────────────────────────────
  //
  // Removes a single entry from the recent projects list by file_path.
  // Called when the user explicitly dismisses a project from the UI.
  //
  // Payload: file_path: string
  // Returns: { removed: boolean }

  ipcMain.handle('app:remove-recent-project', (_event, file_path: string) => {
    const removed = getRecentRepo().remove(file_path)
    return { removed }
  })

  // ── app:prune-recent-projects ──────────────────────────────────────────────
  //
  // Explicitly triggers a prune pass to remove entries whose .presupuesto
  // file no longer exists on disk. Useful to call on app startup.
  //
  // Returns: { pruned: number } — count of entries removed

  ipcMain.handle('app:prune-recent-projects', () => {
    const pruned = getRecentRepo().pruneStaleEntries()
    return { pruned }
  })
}
