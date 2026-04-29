const db = require("../config/db");

// UUID validation helper
const isValidUUID = (uuid) => {
  if (!uuid) return false;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get cart ID
    const cartResult = await db.query(
      "SELECT id FROM e_carts WHERE user_id = $1",
      [userId],
    );

    if (cartResult.rows.length === 0) {
      return res.json({
        status: true,
        cart: { items: [], total: 0, total_items: 0 },
      });
    }

    const cartId = cartResult.rows[0].id;

    const items = await db.query(
      `SELECT 
        ci.*, 
        p.name AS product_name, 
        p.slug, 
        p.f_image,
        -- Correct Price: If variation exists use pv.price, else p.base_price
        COALESCE(pv.price, p.base_price) AS unit_price,
        -- Tax Data
        CASE 
          WHEN p.tax_id IS NOT NULL THEN 
            jsonb_build_object(
              'id', t.id,
              'name', t.tax_name,
              'percentage', t.tax_percentage
            )
          ELSE NULL 
        END AS tax_data,
        -- Variant Details
        CASE 
          WHEN ci.variation_id IS NULL THEN NULL
          ELSE json_build_object(
            'id', pv.id,
            'price', pv.price,
            'stock', pv.stock,
            'attributes', (
              SELECT json_agg(json_build_object(
                'attribute_name', a.name,
                'attribute_val', av.value
              ))
              FROM variant_attr_mapping vam
              JOIN attr_values av ON vam.attr_value_id = av.id
              JOIN attributes a ON av.attr_id = a.id
              WHERE vam.variant_id = ci.variation_id
            )
          )
        END AS variant_details,
        (ci.variation_id IS NULL) AS is_variation_null
      FROM e_cart_items ci
      LEFT JOIN products p ON ci.product_id = p.id
      LEFT JOIN pro_variants pv ON ci.variation_id = pv.id
      LEFT JOIN tax_settings t ON t.id = p.tax_id
      WHERE ci.cart_id = $1
      ORDER BY ci.created_at DESC;`,
      [cartId],
    );

    let totalItems = 0;
    let subtotal = 0;
    let totalTaxAmount = 0;

    items.rows.forEach((item) => {
      const qty = parseInt(item.quantity);
      const unitPrice = parseFloat(item.unit_price);
      const taxPercent = item.tax_data
        ? parseFloat(item.tax_data.percentage)
        : 0;

      // Single item calculations
      const taxPerUnit = unitPrice * (taxPercent / 100);
      const taxablePrice = unitPrice + taxPerUnit; // Single unit price including tax

      // Line item calculations
      const itemSubtotal = qty * unitPrice;
      const itemTax = itemSubtotal * (taxPercent / 100);

      totalItems += qty;
      subtotal += itemSubtotal;
      totalTaxAmount += itemTax;

      // Add new indexes to the item object for frontend
      item.taxable_price = parseFloat(taxablePrice.toFixed(2)); // Unit price + Tax
      item.item_subtotal = parseFloat(itemSubtotal.toFixed(2)); // Total for this row (Excl. Tax)
      item.item_tax = parseFloat(itemTax.toFixed(2)); // Total tax for this row
    });

    const grandTotal = subtotal + totalTaxAmount;

    res.json({
      status: true,
      cart: {
        id: cartId,
        items: items.rows,
        total_items: totalItems,
        subtotal: parseFloat(subtotal.toFixed(2)),
        total_tax: parseFloat(totalTaxAmount.toFixed(2)),
        total: parseFloat(grandTotal.toFixed(2)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.get_d_Cart = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get cart ID
    const cartResult = await db.query(
      "SELECT id FROM e_carts WHERE distributor_id = $1",
      [userId],
    );

    if (cartResult.rows.length === 0) {
      return res.json({
        status: true,
        cart: { items: [], total: 0, total_items: 0 },
      });
    }

    const cartId = cartResult.rows[0].id;

    // const query = `SELECT
    // ci.*,
    // p.name AS product_name,
    // p.slug,
    // p.f_image,
    // p.base_price AS price,
    // -- Tax Data Population
    //     CASE
    //       WHEN p.tax_id IS NOT NULL THEN
    //         jsonb_build_object(
    //           'id', t.id,
    //           'name', t.tax_name,
    //           'percentage', t.tax_percentage
    //         )
    //       ELSE NULL
    //     END AS tax_data,
    // -- Variant data ko JSON format mein generate karein
    // CASE
    //     WHEN ci.variation_id IS NULL THEN NULL
    //     ELSE json_build_object(
    //         'id', pv.id,
    //         'price', pv.price,
    //         'stock', pv.stock,
    //         'attributes', (
    //             SELECT json_agg(json_build_object(
    //                 'attribute_name', a.name,
    //                 'value', av.value
    //             ))
    //             FROM variant_attr_mapping vam
    //             JOIN attr_values av ON vam.attr_value_id = av.id
    //             JOIN attributes a ON av.attr_id = a.id
    //             WHERE vam.variant_id = ci.variation_id
    //         )
    //     )
    // END AS variant_details,
    // (ci.variation_id IS NULL) AS is_variation_null
    // FROM e_cart_items ci
    // LEFT JOIN products p ON ci.product_id = p.id
    // LEFT JOIN pro_variants pv ON ci.variation_id = pv.id
    // LEFT JOIN tax_settings t ON t.id = p.tax_id
    // WHERE ci.cart_id = $1
    // ORDER BY ci.created_at DESC;`;

    const query = `SELECT 
    ci.*, 
    p.name AS product_name, 
    p.slug, 
    p.f_image,
    COALESCE(pv.price, p.base_price) AS unit_price,
    ROUND(
        (COALESCE(pv.price, p.base_price) * COALESCE(t.tax_percentage, 0) / 100)::numeric, 
        2
    ) AS tax_amount,

    ROUND(
        (COALESCE(pv.price, p.base_price) * (1 + COALESCE(t.tax_percentage, 0) / 100))::numeric, 
        2
    ) AS total_unit_price,

    -- 4. Subtotal (Total Unit Price * Quantity)
    ROUND(
        (ci.quantity * (COALESCE(pv.price, p.base_price) * (1 + COALESCE(t.tax_percentage, 0) / 100)))::numeric, 
        2
    ) AS item_subtotal,

    -- Tax Data Population
        CASE 
          WHEN p.tax_id IS NOT NULL THEN 
            jsonb_build_object(
              'id', t.id,
              'name', t.tax_name,
              'percentage', t.tax_percentage
            )
          ELSE NULL 
        END AS tax_data,
    -- Variant data ko JSON format mein generate karein
    CASE 
        WHEN ci.variation_id IS NULL THEN NULL
        ELSE json_build_object(
            'id', pv.id,
            'price', pv.price,
            'stock', pv.stock,
            'attributes', (
                SELECT json_agg(json_build_object(
                    'attribute_name', a.name,
                    'value', av.value
                ))
                FROM variant_attr_mapping vam
                JOIN attr_values av ON vam.attr_value_id = av.id
                JOIN attributes a ON av.attr_id = a.id
                WHERE vam.variant_id = ci.variation_id
            )
        )
    END AS variant_details,
    (ci.variation_id IS NULL) AS is_variation_null
    FROM e_cart_items ci
    LEFT JOIN products p ON ci.product_id = p.id
    LEFT JOIN pro_variants pv ON ci.variation_id = pv.id
    LEFT JOIN tax_settings t ON t.id = p.tax_id
    WHERE ci.cart_id = $1
    ORDER BY ci.created_at DESC;`;

    const items = await db.query(query, [cartId]);

    const totalItems = items.rows.reduce((sum, item) => sum + item.quantity, 0);
    const total = items.rows.reduce(
      (sum, item) => sum + item.quantity * parseFloat(item.price),
      0,
    );

    res.json({
      status: true,
      cart: {
        id: cartId,
        items: items.rows,
        total_items: totalItems,
        total: parseFloat(total.toFixed(2)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.addCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, variation_id, quantity = 1, price } = req.body;

    // // Input validation
    // if (!product_id || !isValidUUID(product_id)) {
    //   return res.status(400).json({ status: false, error: 'Valid product_id (UUID) is required' });
    // }
    // if (variation_id && !isValidUUID(variation_id)) {
    //   return res.status(400).json({ status: false, error: 'Valid variation_id (UUID) is required' });
    // }
    if (quantity < 1 || !Number.isInteger(Number(quantity))) {
      return res
        .status(400)
        .json({ status: false, error: "quantity must be integer >= 1" });
    }
    if (!price || typeof price !== "number" || price <= 0) {
      return res
        .status(400)
        .json({ status: false, error: "Valid price (> 0) is required" });
    }

    let cartResult = await db.query(
      "SELECT id FROM e_carts WHERE user_id = $1",
      [userId],
    );
    let cartId;

    if (cartResult.rows.length === 0) {
      const newCart = await db.query(
        "INSERT INTO e_carts (user_id) VALUES ($1) RETURNING id",
        [userId],
      );
      cartId = newCart.rows[0].id;
    } else {
      cartId = cartResult.rows[0].id;
    }

    // Check existing item
    const existing = await db.query(
      "SELECT id, quantity FROM e_cart_items WHERE cart_id = $1 AND product_id = $2 AND (variation_id = $3 OR variation_id IS NULL)",
      [cartId, product_id, variation_id || null],
    );

    if (existing.rows.length > 0) {
      // Update quantity
      await db.query(
        "UPDATE e_cart_items SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [quantity, existing.rows[0].id],
      );
    } else {
      // Insert new
      await db.query(
        `INSERT INTO e_cart_items (cart_id, product_id, variation_id, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [cartId, product_id, variation_id || null, quantity, price],
      );
    }

    res.status(201).json({ status: true, message: "Item added to cart" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.add_d_CartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, variation_id, quantity = 1, price } = req.body;

    // // Input validation
    // if (!product_id || !isValidUUID(product_id)) {
    //   return res.status(400).json({ status: false, error: 'Valid product_id (UUID) is required' });
    // }
    // if (variation_id && !isValidUUID(variation_id)) {
    //   return res.status(400).json({ status: false, error: 'Valid variation_id (UUID) is required' });
    // }
    if (quantity < 1 || !Number.isInteger(Number(quantity))) {
      return res
        .status(400)
        .json({ status: false, error: "quantity must be integer >= 1" });
    }
    if (!price || typeof price !== "number" || price <= 0) {
      return res
        .status(400)
        .json({ status: false, error: "Valid price (> 0) is required" });
    }

    let cartResult = await db.query(
      "SELECT id FROM e_carts WHERE distributor_id = $1",
      [userId],
    );
    let cartId;

    if (cartResult.rows.length === 0) {
      const newCart = await db.query(
        "INSERT INTO e_carts (distributor_id) VALUES ($1) RETURNING id",
        [userId],
      );
      cartId = newCart.rows[0].id;
    } else {
      cartId = cartResult.rows[0].id;
    }

    // Check existing item
    const existing = await db.query(
      "SELECT id, quantity FROM e_cart_items WHERE cart_id = $1 AND product_id = $2 AND (variation_id = $3 OR variation_id IS NULL)",
      [cartId, product_id, variation_id || null],
    );

    if (existing.rows.length > 0) {
      // Update quantity
      await db.query(
        "UPDATE e_cart_items SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [quantity, existing.rows[0].id],
      );
    } else {
      // Insert new
      await db.query(
        `INSERT INTO e_cart_items (cart_id, product_id, variation_id, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [cartId, product_id, variation_id || null, quantity, price],
      );
    }

    res.status(201).json({ status: true, message: "Item added to cart" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id, quantity } = req.body;

    if (!item_id || quantity < 1) {
      return res
        .status(400)
        .json({ status: false, error: "item_id, quantity required" });
    }

    const result = await db.query(
      `UPDATE e_cart_items 
       SET quantity = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND cart_id IN (SELECT id FROM e_carts WHERE user_id = $3)
       RETURNING id`,
      [quantity, item_id, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: "Item not found" });
    }

    res.json({ status: true, message: "Cart item updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.updateCartItemQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: item_id } = req.params;
    const { quantity } = req.body;

    if (!item_id || quantity < 1 || !Number.isInteger(Number(quantity))) {
      return res.status(400).json({
        status: false,
        error: "Valid item_id and quantity (>=1 integer) required",
      });
    }

    const result = await db.query(
      `UPDATE e_cart_items 
       SET quantity = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND cart_id IN (SELECT id FROM e_carts WHERE user_id = $3)
       RETURNING id`,
      [quantity, item_id, userId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: false, error: "Item not found or access denied" });
    }

    res.json({ status: true, message: "Cart item quantity updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.updateCart_d_ItemQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: item_id } = req.params;
    const { quantity } = req.body;

    if (!item_id || quantity < 1 || !Number.isInteger(Number(quantity))) {
      return res.status(400).json({
        status: false,
        error: "Valid item_id and quantity (>=1 integer) required",
      });
    }

    const result = await db.query(
      `UPDATE e_cart_items 
       SET quantity = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND cart_id IN (SELECT id FROM e_carts WHERE distributor_id = $3)
       RETURNING id`,
      [quantity, item_id, userId],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ status: false, error: "Item not found or access denied" });
    }

    res.json({ status: true, message: "Cart item quantity updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.removeCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id } = req.params;

    const result = await db.query(
      "DELETE FROM e_cart_items WHERE id = $1 AND cart_id IN (SELECT id FROM e_carts WHERE user_id = $2) RETURNING id",
      [item_id, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: "Item not found" });
    }

    res.json({ status: true, message: "Item removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.remove_d_CartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { item_id } = req.params;

    const result = await db.query(
      "DELETE FROM e_cart_items WHERE id = $1 AND cart_id IN (SELECT id FROM e_carts WHERE distributor_id = $2) RETURNING id",
      [item_id, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: false, error: "Item not found" });
    }

    res.json({ status: true, message: "Item removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const cartResult = await db.query(
      "SELECT id FROM e_carts WHERE user_id = $1",
      [userId],
    );
    if (cartResult.rows.length > 0) {
      await db.query("DELETE FROM e_cart_items WHERE cart_id = $1", [
        cartResult.rows[0].id,
      ]);
    }
    res.json({ status: true, message: "Cart cleared" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.clear_d_Cart = async (req, res) => {
  try {
    const userId = req.user.id;
    const cartResult = await db.query(
      "SELECT id FROM e_carts WHERE distributor_id = $1",
      [userId],
    );
    if (cartResult.rows.length > 0) {
      await db.query("DELETE FROM e_cart_items WHERE cart_id = $1", [
        cartResult.rows[0].id,
      ]);
    }
    res.json({ status: true, message: "Cart cleared" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};
