-- ✅ Add columns (safe)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS binary_path LTREE,
ADD COLUMN IF NOT EXISTS position INT;

-- ✅ Add constraint safely (Postgres doesn't support IF NOT EXISTS for constraints)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_position'
    ) THEN
        ALTER TABLE users 
        ADD CONSTRAINT chk_position 
        CHECK (position IN (1,2) OR position IS NULL);
    END IF;
END $$;

-- ✅ Index for fast ltree queries
CREATE INDEX IF NOT EXISTS idx_users_binary_path 
ON users USING GIST (binary_path);

-- ✅ Prevent duplicate LEFT/RIGHT under same parent (safe version)
CREATE UNIQUE INDEX IF NOT EXISTS unique_parent_position 
ON users (
    CASE 
        WHEN nlevel(binary_path) > 1 
        THEN subpath(binary_path, 0, nlevel(binary_path)-1)
        ELSE NULL
    END,
    position
)
WHERE position IS NOT NULL;