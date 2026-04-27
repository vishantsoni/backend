-- Login attempt protection: add failed attempts tracking to users table


CREATE TABLE IF NOT EXISTS distributor_inventory (
    id SERIAL PRIMARY KEY,
    distributor_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    variant_id INTEGER REFERENCES pro_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_distributor_inventory_unique
ON distributor_inventory (distributor_id, product_id, COALESCE(variant_id, 0));

CREATE INDEX IF NOT EXISTS idx_distributor_inventory_distributor_id ON distributor_inventory(distributor_id);
CREATE INDEX IF NOT EXISTS idx_distributor_inventory_product_id ON distributor_inventory(product_id);
