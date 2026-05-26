CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  client_name TEXT,
  status TEXT DEFAULT 'active',  -- active | archived
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS phases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',   -- draft | approved
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phases(id),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  code TEXT,
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  unit_price_snapshot REAL DEFAULT 0,
  total_cost REAL GENERATED ALWAYS AS (quantity * unit_price_snapshot) STORED,
  price_captured_at TIMESTAMP,
  inpp_index_ref INTEGER REFERENCES inpp_indices(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS apu_components (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL REFERENCES concepts(id),
  type TEXT NOT NULL,            -- material | labor | equipment | subcontract
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  unit_price REAL DEFAULT 0,
  subtotal REAL GENERATED ALWAYS AS (quantity * unit_price) STORED,
  catalog_ref TEXT REFERENCES price_catalog(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS apu_revisions (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL REFERENCES concepts(id),
  snapshot_json TEXT NOT NULL,   -- JSON del APU completo en ese momento
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_catalog (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,        -- material | labor | equipment
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  last_price REAL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inpp_indices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id TEXT NOT NULL,       -- clave INEGI: ej. SP74165
  series_name TEXT NOT NULL,
  period TEXT NOT NULL,          -- formato YYYY/MM
  value REAL NOT NULL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(series_id, period)
);

CREATE TABLE IF NOT EXISTS execution_log (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL REFERENCES concepts(id),
  date DATE NOT NULL,
  quantity_executed REAL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_phases_project ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_chapters_phase ON chapters(phase_id);
CREATE INDEX IF NOT EXISTS idx_concepts_chapter ON concepts(chapter_id);
CREATE INDEX IF NOT EXISTS idx_apu_concept ON apu_components(concept_id);
CREATE INDEX IF NOT EXISTS idx_execution_concept ON execution_log(concept_id);
CREATE INDEX IF NOT EXISTS idx_inpp_series ON inpp_indices(series_id, period);