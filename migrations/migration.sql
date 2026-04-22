-- Login attempt protection: add failed attempts tracking to users table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_status TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS distributor_id INTEGER DEFAULT NULL;
ALTER TABLE e_user_addresses ADD COLUMN IF NOT EXISTS distributor_id INTEGER DEFAULT NULL;
ALTER TABLE e_carts ADD COLUMN IF NOT EXISTS distributor_id INTEGER DEFAULT NULL;