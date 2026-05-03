const db = require("../config/db");

async function seedMainStoreInventory() {
  const client = await db.connect();
  try {
    console.log("Seeding main store inventory (distributor_id=0)...");

    // 1. Simple products (no variants)
    await client.query(`
      INSERT INTO distributor_inventory (distributor_id, product_id, quantity)
      SELECT 0, p.id, 100
      FROM products p 
      LEFT JOIN pro_variants pv ON p.id = pv.product_id
      WHERE pv.id IS NULL AND NOT EXISTS (
        SELECT 1 FROM distributor_inventory di 
        WHERE di.distributor_id = 0 AND di.product_id = p.id AND di.variant_id IS NULL
      )
    `);

    // 2. Variants
    await client.query(`
      INSERT INTO distributor_inventory (distributor_id, product_id, variant_id, quantity)
      SELECT 0, pv.product_id, pv.id, GREATEST(pv.stock, 50)
      FROM pro_variants pv
      LEFT JOIN distributor_inventory di ON di.distributor_id = 0 
        AND di.product_id = pv.product_id AND di.variant_id = pv.id
      WHERE di.id IS NULL
    `);

    const count = await client.query(`
      SELECT COUNT(*)::int as total FROM distributor_inventory WHERE distributor_id = 0
    `);

    console.log(
      `✅ Seeded main store inventory for ${count.rows[0].total} records`,
    );
  } catch (error) {
    console.error("Seed failed:", error);
  } finally {
    client.release();
  }
}

seedMainStoreInventory();
