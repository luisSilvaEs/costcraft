/**
 * project.handlers.ts
 *
 * IPC handlers relacionados con el archivo .presupuesto y la info del proyecto.
 *
 * Canales registrados:
 *   project:new          — crea un archivo .presupuesto nuevo (dialog save)
 *   project:open         — abre un archivo .presupuesto existente (dialog open)
 *   project:close        — cierra la conexión al archivo actual
 *   project:get-info     — obtiene el registro de project_info
 *   project:update-info  — actualiza campos de project_info
 *   project:get-path     — devuelve la ruta del archivo abierto actualmente
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import Database from 'better-sqlite3'
import { DatabaseManager } from '../db/DatabaseManager'
import { ProjectRepository } from '../db/repositories/ProjectRepository'
import { RecentProjectsRepository } from '../db/repositories/RecentProjectsRepository'
import type { AppDatabaseManager } from '../db/AppDatabaseManager'

// ─── Estado compartido ────────────────────────────────────────────────────────
//
// Un único archivo .presupuesto abierto a la vez.
// Exportamos el getter para que los demás handlers puedan acceder al mismo db.

let _manager: DatabaseManager | null = null

// Reference to the app-level database manager, set from index.ts at startup.
let _appManager: AppDatabaseManager | null = null

export function setAppManagerForProjects(manager: AppDatabaseManager): void {
  _appManager = manager
}

function getRecentRepo(): RecentProjectsRepository | null {
  if (!_appManager) return null
  return new RecentProjectsRepository(_appManager.getDb())
}

export function getCurrentDb(): Database.Database {
  if (!_manager) {
    throw new Error('No hay ningún proyecto abierto.')
  }
  return _manager.getDb()
}

export function getCurrentFilePath(): string | null {
  return _manager?.path ?? null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openManager(filePath: string): DatabaseManager {
  // Cierra cualquier proyecto que estuviera abierto
  if (_manager) {
    _manager.close()
    _manager = null
  }

  const manager = new DatabaseManager(filePath)
  manager.open() // corre schema + migraciones
  _manager = manager
  return manager
}

// ─── Registro de handlers ─────────────────────────────────────────────────────

export function registerProjectHandlers(): void {
  // ── project:new ─────────────────────────────────────────────────────────────
  //
  // Muestra un diálogo "Guardar como" y crea un .presupuesto vacío con la info
  // inicial del proyecto.
  //
  // Payload de entrada: { title: string, client?: string, description?: string }
  // Retorna: { filePath: string } | null (null si el usuario canceló)

  ipcMain.handle(
    'project:new',
    async (
      event,
      input: {
        title: string
        client?: string
        description?: string
      }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)

      const { filePath, canceled } = await dialog.showSaveDialog(win!, {
        title: 'Guardar nuevo presupuesto',
        defaultPath: `${input.title.replace(/\s+/g, '_')}.presupuesto`,
        filters: [{ name: 'Presupuesto CostCraft', extensions: ['presupuesto'] }]
      })

      if (canceled || !filePath) return null

      const manager = openManager(filePath)
      const repo = new ProjectRepository(manager.getDb())

      const projectInfo = repo.createProject({
        title: input.title,
        client: input.client,
        description: input.description
      })

      // Record in recent projects so it appears on the landing page
      getRecentRepo()?.upsert({
        file_path: filePath,
        title: projectInfo.title,
        client: projectInfo.client
      })

      return { filePath }
    }
  )

  // ── project:open ────────────────────────────────────────────────────────────
  //
  // Muestra un diálogo "Abrir" y abre el .presupuesto seleccionado.
  //
  // Retorna: { filePath: string, projectInfo: ProjectInfo } | null

  ipcMain.handle('project:open', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)

    const { filePaths, canceled } = await dialog.showOpenDialog(win!, {
      title: 'Abrir presupuesto',
      filters: [{ name: 'Presupuesto CostCraft', extensions: ['presupuesto'] }],
      properties: ['openFile']
    })

    if (canceled || filePaths.length === 0) return null

    const filePath = filePaths[0]
    const manager = openManager(filePath)
    const repo = new ProjectRepository(manager.getDb())
    const projectInfo = repo.getProjectInfo()

    // Record in recent projects so it floats to the top of the landing page
    if (projectInfo) {
      getRecentRepo()?.upsert({
        file_path: filePath,
        title: projectInfo.title,
        client: projectInfo.client
      })
    }

    return { filePath, projectInfo }
  })

  // ── project:close ───────────────────────────────────────────────────────────
  //
  // Cierra la conexión al archivo actual.
  // El renderer debe navegar a la pantalla de inicio antes de llamar este canal.

  ipcMain.handle('project:close', () => {
    if (_manager) {
      _manager.close()
      _manager = null
    }
  })

  // ── project:get-info ────────────────────────────────────────────────────────
  //
  // Retorna el registro único de project_info.

  ipcMain.handle('project:get-info', () => {
    const repo = new ProjectRepository(getCurrentDb())
    return repo.getProjectInfo()
  })

  // ── project:update-info ─────────────────────────────────────────────────────
  //
  // Actualiza campos de project_info.
  //
  // Payload: Partial<{ title, client, description, status }>

  ipcMain.handle(
    'project:update-info',
    (
      _event,
      updates: {
        title?: string
        client?: string
        description?: string
        status?: string
      }
    ) => {
      const repo = new ProjectRepository(getCurrentDb())
      return repo.updateProjectInfo(updates)
    }
  )

  // ── project:get-path ────────────────────────────────────────────────────────
  //
  // Devuelve la ruta del archivo actualmente abierto, o null si no hay ninguno.

  ipcMain.handle('project:get-path', () => {
    return getCurrentFilePath()
  })
}
