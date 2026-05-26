// scripts/seed-recents.mjs
// Usage: node scripts/seed-recents.mjs

import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

// Same path that AppDatabaseManager uses
const userDataDir = join(homedir(), 'Library', 'Application Support', 'costcraft') // macOS
// Windows: join(homedir(), 'AppData', 'Roaming', 'costcraft')
// Linux:   join(homedir(), '.config', 'costcraft')

mkdirSync(userDataDir, { recursive: true })

const db = new Database(join(userDataDir, 'app.db'))

// Make sure the table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS recent_projects (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path      TEXT    NOT NULL UNIQUE,
    title          TEXT    NOT NULL,
    client         TEXT,
    last_opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

const insert = db.prepare(`
  INSERT INTO recent_projects (file_path, title, client, last_opened_at)
  VALUES (@file_path, @title, @client, @last_opened_at)
  ON CONFLICT (file_path) DO UPDATE SET
    title          = excluded.title,
    client         = excluded.client,
    last_opened_at = excluded.last_opened_at
`)

const projects = [
  {
    file_path: '/Users/luissilva/Documents/carretera_federal.presupuesto',
    title: 'Carretera Federal km 12–18',
    client: 'SCT',
    last_opened_at: new Date().toISOString()
  },
  {
    file_path: '/Users/luissilva/Documents/edificio_oaxaca.presupuesto',
    title: 'Edificio Oaxaca — Torre A',
    client: 'Constructora del Sur',
    last_opened_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
  },
  {
    file_path: '/Users/luissilva/Documents/puente_necaxa.presupuesto',
    title: 'Puente Necaxa',
    client: null,
    last_opened_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() // 8 days ago
  }
]

for (const p of projects) {
  insert.run(p)
  console.log(`✓ ${p.title}`)
}

db.close()
console.log('\nDone — restart the app to see the recents list.')
