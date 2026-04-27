const db = require("../config/db");

// Distributor: Get my inventory with product details
exports.getMyInventory = async (req, res) => {
  try {
    const distributorId = req.user.id;
    const { page = 1, limit = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = "WHERE di.distributor_id = $1";
    const params = [distributorId];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (p.name ILIKE $${params.length} OR pv.sku ILIKE $${params.length})`;
    }

    const query = `
      SELECT 
        di.id,
        di.quantity,
        di.created_at,
        di.updated_at,
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'slug', p.slug,
          'f_image', p.f_image,
          'base_price', p.base_price
        ) AS product,
        CASE 
          WHEN pv.id IS NOT NULL THEN
            jsonb_build_object(
              'id', pv.id,
              'sku', pv.sku,
              'price', pv.price,
              'bv_point', pv.bv_point,
              'attr_combinations', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'attr_value_id', vam.attr_value_id,
                    'attr_id', av.attr_id,
                    'value', av.value
                  ) ORDER BY av.attr_id
                )
                FROM variant_attr_mapping vam
                JOIN attr_values av ON vam.attr_value_id = av.id
                WHERE vam.variant_id = pv.id
              ), '[]'::jsonb)
            )
          ELSE NULL
        END AS variant
      FROM distributor_inventory di
      JOIN products p ON di.product_id = p.id
      LEFT JOIN pro_variants pv ON di.variant_id = pv.id
      ${whereClause}
      ORDER BY di.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countQuery = `
      SELECT COUNT(*)::int 
      FROM distributor_inventory di
      JOIN products p ON di.product_id = p.id
      LEFT JOIN pro_variants pv ON di.variant_id = pv.id
      ${whereClause}
    `;

    const result = await db.query(query, [...params, parseInt(limit), offset]);
    const countResult = await db.query(countQuery, params);

    res.json({
      success: true,
      id: distributorId,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.rows[0].count,
        pages: Math.ceil(countResult.rows[0].count / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get my inventory error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Admin: Get any distributor's inventory
exports.getDistributorInventory = async (req, res) => {
  try {
    const { distributor_id } = req.params;
    const { page = 1, limit = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    if (!distributor_id || isNaN(parseInt(distributor_id))) {
      return res.status(400).json({
        success: false,
        message: "Valid distributor_id is required",
      });
    }

    let whereClause = "WHERE di.distributor_id = $1";
    const params = [parseInt(distributor_id)];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (p.name ILIKE $${params.length} OR pv.sku ILIKE $${params.length})`;
    }

    const query = `
      SELECT 
        di.id,
        di.quantity,
        di.created_at,
        di.updated_at,
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'slug', p.slug,
          'f_image', p.f_image,
          'base_price', p.base_price
        ) AS product,
        CASE 
          WHEN pv.id IS NOT NULL THEN
            jsonb_build_object(
              'id', pv.id,
              'sku', pv.sku,
              'price', pv.price,
              'bv_point', pv.bv_point,
              'attr_combinations', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'attr_value_id', vam.attr_value_id,
                    'attr_id', av.attr_id,
                    'value', av.value
                  ) ORDER BY av.attr_id
                )
                FROM variant_attr_mapping vam
                JOIN attr_values av ON vam.attr_value_id = av.id
                WHERE vam.variant_id = pv.id
              ), '[]'::jsonb)
            )
          ELSE NULL
        END AS variant
      FROM distributor_inventory di
      JOIN products p ON di.product_id = p.id
      LEFT JOIN pro_variants pv ON di.variant_id = pv.id
      ${whereClause}
      ORDER BY di.updated_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countQuery = `
      SELECT COUNT(*)::int 
      FROM distributor_inventory di
      JOIN products p ON di.product_id = p.id
      LEFT JOIN pro_variants pv ON di.variant_id = pv.id
      ${whereClause}
    `;

    const result = await db.query(query, [...params, parseInt(limit), offset]);
    const countResult = await db.query(countQuery, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.rows[0].count,
        pages: Math.ceil(countResult.rows[0].count / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get distributor inventory error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Admin or Distributor: Manually adjust stock
exports.adjustStock = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const distributorId = req.user.id;
    const { product_id, variant_id, quantity, reason } = req.body;

    if (!product_id || isNaN(parseInt(product_id))) {
      return res.status(400).json({
        success: false,
        message: "Valid product_id is required",
      });
    }

    if (quantity === undefined || isNaN(parseInt(quantity))) {
      return res.status(400).json({
        success: false,
        message: "Valid quantity is required",
      });
    }

    const productId = parseInt(product_id);
    const variantId = variant_id ? parseInt(variant_id) : null;
    const qty = parseInt(quantity);

    // Check if product exists
    const productCheck = await client.query(
      "SELECT id FROM products WHERE id = $1",
      [productId],
    );
    if (productCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    // If variant_id provided, check it exists
    if (variantId) {
      const variantCheck = await client.query(
        "SELECT id FROM pro_variants WHERE id = $1 AND product_id = $2",
        [variantId, productId],
      );
      if (variantCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Variant not found for this product",
        });
      }
    }

    // Insert or update inventory
    const result = await client.query(
      `INSERT INTO distributor_inventory (distributor_id, product_id, variant_id, quantity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (distributor_id, product_id, COALESCE(variant_id, 0))
       DO UPDATE SET 
         quantity = distributor_inventory.quantity + EXCLUDED.quantity,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [distributorId, productId, variantId, qty],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `Stock ${qty >= 0 ? "increased" : "decreased"} by ${Math.abs(
        qty,
      )}`,
      data: result.rows[0],
      reason: reason || "Manual adjustment",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Adjust stock error:", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
};
