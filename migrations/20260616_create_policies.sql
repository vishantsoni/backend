-- Policies PDF upload (Super Admin) + distributor viewing

CREATE TABLE IF NOT EXISTS policies (
  id SERIAL PRIMARY KEY,

  title TEXT NOT NULL,
  version TEXT,

  -- file locations
  file_url TEXT,
  file_path TEXT,

  -- only one active policy at a time (handled in controller), but keep generic flag
  is_active BOOLEAN NOT NULL DEFAULT true,

  uploaded_by INTEGER,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_policies_is_active ON policies(is_active);
CREATE INDEX IF NOT EXISTS idx_policies_updated_at ON policies(updated_at);

