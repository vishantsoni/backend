const db = require("../config/db");
const generateOrderId = () => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomNum = Math.floor(Math.random() * 10000);
  return `ORD-D-${dateStr}-${randomNum.toString().padStart(4, "0")}`;
};

const distributeCommission = async (client, userId, body) => {
  try {
    const { amount, razorpay_order_id, order_id } = body;

    // 1. SELF COMMISSION (CASHBACK) - Level 0 Logic
    const commConfigOWN = await client.query(
      `SELECT commission_percentage FROM level_commissions WHERE level_no = 0`,
    );
    const ownRate = commConfigOWN.rows[0]?.commission_percentage || 0;
    const ownCommission = amount * (ownRate / 100);

    if (ownCommission > 0) {
      await client.query(
        `INSERT INTO transactions (user_id, amount, type, category, source_user_id, status, remarks)
         VALUES ($1, $2, 'credit', 'commission', $1, 'pending', 'Self purchase cashback')`,
        [userId, ownCommission],
      );
      await client.query(
        `UPDATE wallets SET pending_amount = pending_amount + $1 WHERE user_id = $2`,
        [ownCommission, userId],
      );
    }

    // 2. USER DATA & UPLINE TRAVERSAL
    const userDataRes = await client.query(
      "SELECT binary_path, nlevel(binary_path) as depth FROM users WHERE id = $1",
      [userId],
    );
    if (userDataRes.rows.length === 0)
      return { status: false, message: "User not found" };

    const currentUserPath = userDataRes.rows[0].binary_path;
    const newUserDepth = userDataRes.rows[0].depth;

    const uplineQuery = await client.query(
      `SELECT id, binary_path, nlevel(binary_path) as level
       FROM users
       WHERE binary_path @> $1 AND id != $2
       ORDER BY level DESC`,
      [currentUserPath, userId],
    );
    const uplines = uplineQuery.rows;

    // 3. MAIN MATCHING LOOP
    for (let upline of uplines) {
      const isLeft = currentUserPath.startsWith(`${upline.binary_path}.1`);
      const legColumn = isLeft ? "left_count" : "right_count";
      const oppositeLegPath = isLeft
        ? `${upline.binary_path}.2`
        : `${upline.binary_path}.1`;

      // A. Wallet Counter Update (Old Logic)
      const walletUpdate = await client.query(
        `UPDATE wallets SET ${legColumn} = ${legColumn} + 1
         WHERE user_id = $1 RETURNING left_count, right_count, paid_pairs`,
        [upline.id],
      );

      const { left_count, right_count, paid_pairs } = walletUpdate.rows[0];

      // B. Pair Verification (Old Logic)
      const currentMatches = Math.min(left_count, right_count);
      const newPairs = currentMatches - paid_pairs;

      if (newPairs > 0) {
        // C. Naya Logic: Find Pending Order in Opposite Leg
        const pendingMatch = await client.query(
          `SELECT o.id, o.sub_total FROM orders o
           JOIN users u ON o.distributor_id = u.id
           WHERE u.binary_path <@ $1 AND o.commission_status = 'pending'
           ORDER BY o.created_at ASC LIMIT 1`,
          [oppositeLegPath],
        );

        if (pendingMatch.rows.length > 0) {
          const matchedOrder = pendingMatch.rows[0];

          // D. Amount Merging (Current + Matched)
          const totalMatchingAmount =
            parseFloat(amount) + parseFloat(matchedOrder.sub_total);

          // E. Relative Level Calculation (Old Logic)
          const relativeLevel = newUserDepth - upline.level;
          const commConfig = await client.query(
            `SELECT commission_percentage FROM level_commissions WHERE level_no = $1`,
            [relativeLevel],
          );

          const rate = commConfig.rows[0]?.commission_percentage || 0;
          const commissionAmount =
            newPairs * (totalMatchingAmount * (rate / 100));

          if (commissionAmount > 0) {
            // F. Mark Orders as Paid
            await client.query(
              `UPDATE orders SET commission_status = 'paid' WHERE id = $1`,
              [matchedOrder.id],
            );
            await client.query(
              `UPDATE orders SET commission_status = 'paid' WHERE order_id = $1`,
              [order_id],
            );

            // G. Final Wallet & Transaction Update
            await client.query(
              `UPDATE wallets SET total_amount = total_amount + $1, paid_pairs = $2 WHERE user_id = $3`,
              [commissionAmount, currentMatches, upline.id],
            );

            await client.query(
              `INSERT INTO transactions (user_id, amount, type, category, source_user_id, status, remarks)
               VALUES ($1, $2, 'credit', 'commission', $3, 'completed', $4)`,
              [
                upline.id,
                commissionAmount,
                userId,
                `Pair Match: Order ${matchedOrder.id} & Current Order`,
              ],
            );
          }
        }
      } else {
        // Agar pair nahi bana, toh order ko pending mark karein
        await client.query(
          `UPDATE orders SET commission_status = 'pending' WHERE order_id = $1`,
          [order_id],
        );
      }
    }

    // 4. ACCOUNT ACTIVATION
    await client.query(`UPDATE users SET is_active = true WHERE id = $1`, [
      userId,
    ]);

    return { status: true, message: "Commission processed successfully" };
  } catch (error) {
    console.error("Distribution Error:", error);
    throw error; // d_p_o function isse catch karke rollback trigger karega
  }
};

exports.d_p_o = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const userId = req.user.id;
    const {
      items, // [{product_id, variant_id, qty}],
      shipping_address,
      coupon_code,
      payment_method = "wallet",
      razorpay_order_id,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Items required" });
    }

    // 1. Validate items, calculate totals
    let subTotal = 0;
    let totalBV = 0;
    const validatedItems = [];

    let taxAmount = 0;

    for (const item of items) {
      const { product_id, variant_id, qty, tax_data } = item;

      let productData;
      let taxRate = 0;

      if (variant_id) {
        // --- CASE 1: Variable Product ---
        const variantRes = await client.query(
          `SELECT pv.sku, pv.price, pv.bv_point, pv.stock, p.name as product_name, 
              p.f_image as product_image,
              t.tax_percentage as tax_rate,
              COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'attr_id', av.attr_id,
                    'attr_value_id', vam.attr_value_id, 
                    'value', av.value
                  ) ORDER BY av.attr_id
                )
                FROM variant_attr_mapping vam
                JOIN attr_values av ON vam.attr_value_id = av.id 
                WHERE vam.variant_id = pv.id
              ), '[]'::jsonb) as attributes
              FROM pro_variants pv 
              JOIN products p ON pv.product_id = p.id 
              LEFT JOIN tax_settings t ON t.id = p.tax_id 
              WHERE pv.id = $1 AND p.id = $2 AND p.status = 'active'`,
          [variant_id, product_id],
        );
        productData = variantRes.rows[0];
      } else {
        // --- CASE 2: Simple Product (No Variation) ---
        // --- CASE 2: Simple Product (No Variation) ---
        const productRes = await client.query(
          `SELECT 
            p.id::text as sku, 
            t.tax_percentage as tax_rate,
            p.base_price as price, 
            null as bv_point, -- Changed from null to p.bv_point if simple products have points
            null as stock, 
            p.name as product_name, 
            p.f_image as product_image, 
            '[]'::jsonb as attributes,
            -- Also build the tax_data object here to store in variant_details
            jsonb_build_object(
              'id', t.id,
              'name', t.tax_name,
              'percentage', t.tax_percentage
            ) as tax_info
          FROM products p
          LEFT JOIN tax_settings t ON t.id = p.tax_id 
          WHERE p.id = $1 AND p.status = 'active'`, // Fixed ambiguous reference
          [product_id],
        );
        productData = productRes.rows[0];
      }

      if (!productData) {
        throw new Error(
          `Product or Variant not found/active: ID ${product_id} ${
            variant_id ? "Var " + variant_id : ""
          }`,
        );
      }

      // Check Stock
      // if (productData.stock && productData.stock < qty) {
      //   throw new Error(`Insufficient stock for ${productData.product_name}`);
      // }

      taxRate = parseFloat(productData.tax_rate);
      const itemTotal = parseFloat(productData.price) * qty;
      const itemBV = (productData.bv_point || 0) * qty;

      validatedItems.push({
        product_id,
        variant_id: variant_id || null, // Ensure null if simple product
        product_name: productData.product_name,
        product_image: productData.product_image,
        variant_sku: productData.sku || "N/A",
        variant_details: {
          price: productData.price,
          bv_point: productData.bv_point,
          tax_data: tax_data,
          attributes: productData.attributes || [],
        },
        qty,
        unit_price: productData.price,
        unit_bv_points: productData.bv_point,
        total_item_price: itemTotal,
        total_item_bv: itemBV,
      });

      subTotal += itemTotal;
      totalBV += itemBV;
      taxAmount += (itemTotal * taxRate) / 100;
    }

    // 2. Tax (simple 18% GST for now, link to tax_settings later)

    // 3. Shipping (flat 50 for now)
    const shippingCharges = 50;

    // 4. Coupon discount (if provided)
    let discount = 0;
    if (coupon_code) {
      // Reuse coupon logic or simple check
      const coupon = await client.query(
        "SELECT * FROM coupons WHERE code = $1 AND status = 'active'",
        [coupon_code.toUpperCase()],
      );
      if (coupon.rows[0]) {
        // Simplified: fixed/percentage on subTotal
        const c = coupon.rows[0];
        if (c.discount_type === "percentage") {
          discount = (parseFloat(c.discount_amount) / 100) * subTotal;
        } else {
          discount = parseFloat(c.discount_amount);
        }
        discount = Math.min(
          discount,
          parseFloat(c.max_discount_amount || discount),
        );
      }
    }

    const totalAmount = subTotal + taxAmount + shippingCharges - discount;
    // 7. Create order
    const orderId = generateOrderId();
    const newOrder = await client.query(
      `INSERT INTO orders (order_id, distributor_id, sub_total, tax_amount, shipping_charges, total_amount, total_bv_points, shipping_address, payment_method, order_for)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'admin-distributor') RETURNING *`,
      [
        orderId,
        userId,
        subTotal,
        taxAmount,
        shippingCharges,
        totalAmount,
        totalBV,
        shipping_address,
        payment_method,
      ],
    );

    // 8. Create order_items
    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, variant_id, product_name, product_image, variant_sku, variant_details, qty, unit_price, unit_bv_points, total_item_price, total_item_bv)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          newOrder.rows[0].id,
          item.product_id,
          item.variant_id,
          item.product_name,
          item.product_image,
          item.variant_sku,
          item.variant_details,
          item.qty,
          item.unit_price,
          item.unit_bv_points,
          item.total_item_price,
          item.total_item_bv,
        ],
      );
    }

    const commResult = await distributeCommission(client, userId, {
      amount: subTotal,
      paymentMethod: payment_method,
      razorpay_order_id,
      order_id: orderId,
    });
    if (!commResult.status) throw new Error(commResult.message);

    // 9. Auto-increase distributor inventory
    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO distributor_inventory (distributor_id, product_id, variant_id, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (distributor_id, product_id, COALESCE(variant_id, 0))
         DO UPDATE SET
           quantity = distributor_inventory.quantity + EXCLUDED.quantity,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, item.product_id, item.variant_id || null, item.qty],
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: { ...newOrder.rows[0], items: validatedItems },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Order place error:", error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
};

exports.getAllD_Orders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Initial parameters
    const params = [userId];
    let whereClause = "WHERE o.user_id = $1";

    if (status) {
      params.push(status);
      whereClause += ` AND o.order_status = $${params.length}`;
    }

    // Main Query
    const ordersQuery = `
      SELECT o.*, 
             COUNT(oi.id)::int as items_count,
             COALESCE(SUM(oi.total_item_price), 0) as items_total,
             oi.product_name, oi.product_image
      FROM orders o 
      LEFT JOIN order_items oi ON o.id = oi.order_id
      ${whereClause}
      GROUP BY o.id, oi.product_name, oi.product_image
      ORDER BY o.created_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const orders = await db.query(ordersQuery, [
      ...params,
      parseInt(limit),
      offset,
    ]);

    // Error Fix Here: Added "o" alias to orders table
    const countWhereClause = whereClause.replace(/o\./g, ""); // "o." hata diya kyunki yahan alias ki zaroorat nahi agar single table hai
    // YA phir alias de do:
    const totalRes = await db.query(
      `SELECT COUNT(*)::int FROM orders o ${whereClause}`, // Added "o" here
      params,
    );

    res.json({
      success: true,
      data: orders.rows,
      total: totalRes.rows[0].count, // Frontend compatibility ke liye
      page: parseInt(page),
      limit: parseInt(limit),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRes.rows[0].count,
        pages: Math.ceil(totalRes.rows[0].count / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// placed
exports.getPlacedOrder = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, filter = "all" } = req.query;

    const dis_id = req.user.id;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = "WHERE 1=1";
    const params = [];

    whereClause += ` AND o.distributor_id = ${dis_id} AND (o.order_for NOT LIKE 'distributor_%' OR o.order_for IS NULL)`;

    if (status) {
      params.push(status);
      whereClause += ` AND o.order_status = $${params.length}`;
    }

    if (filter && filter !== "all") {
      if (filter === "my") {
        // Show only rows that ARE for a distributor
        whereClause += ` AND o.order_for LIKE 'distributor_%'`;
      } else if (filter === "distributor") {
        // Show rows that ARE NOT for a distributor OR are NULL
        whereClause += ` AND (o.order_for NOT LIKE 'distributor_%' OR o.order_for IS NULL)`;
      } else {
        // Specific ID match
        // params.push(filter);
        // whereClause += ` AND o.order_for = $${params.length}`;
        whereClause += `o.distributor_id = ${dis_id} AND (o.order_for NOT LIKE 'distributor_%' OR o.order_for IS NULL)`;
      }
    }

    const ordersQuery = `
      SELECT 
        o.*, 
        CASE 
          WHEN o.user_id IS NOT NULL THEN 'User'
          WHEN o.distributor_id IS NOT NULL THEN 'Distributor'
          ELSE 'Unknown'
        END as user_type,
        -- Priority: ecom_user name > distributor full_name > distributor username
        COALESCE(u.name, d.full_name, d.username) as user_name, 
        COALESCE(u.phone, d.phone) as user_phone,
        COALESCE(
          (SELECT json_agg(items)::jsonb 
           FROM (
             SELECT 
               oi.id, oi.product_name, oi.product_image, 
               oi.variant_sku, oi.variant_details, 
               oi.qty, oi.unit_price, oi.total_item_price
             FROM order_items oi 
             WHERE oi.order_id = o.id
           ) items
          ), '[]'::jsonb
        ) as products,
        (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o 
      LEFT JOIN ecom_user u ON o.user_id = u.id
      LEFT JOIN users d ON o.distributor_id = d.id 
      ${whereClause}
      ORDER BY o.created_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const orders = await db.query(ordersQuery, [
      ...params,
      parseInt(limit),
      offset,
    ]);

    const totalRes = await db.query(
      `SELECT COUNT(*)::int FROM orders o ${whereClause}`,
      params,
    );

    res.json({
      success: true,
      clause: ordersQuery,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRes.rows[0].count,
        pages: Math.ceil(totalRes.rows[0].count / parseInt(limit)),
      },
      data: orders.rows,
    });
  } catch (error) {
    console.error("Error in getAllOrders:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getRecievedOrder = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, filter = "all" } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = "WHERE 1=1";
    const params = [];

    if (status) {
      params.push(status);
      whereClause += `  AND o.order_status = $${params.length}`;
    }

    if (filter && filter !== "all") {
      if (filter === "my") {
        // Show only rows that ARE for a distributor
        whereClause += ` AND o.order_for LIKE 'distributor_%'`;
      } else if (filter === "distributor") {
        // Show rows that ARE NOT for a distributor OR are NULL
        whereClause += ` AND (o.order_for NOT LIKE 'distributor_%' OR o.order_for IS NULL)`;
      } else {
        // Specific ID match
        // params.push(filter);
        // whereClause += ` AND o.order_for = $${params.length}`;
      }
    }

    const ordersQuery = `
      SELECT 
        o.*, 
        CASE 
          WHEN o.user_id IS NOT NULL THEN 'User'
          WHEN o.distributor_id IS NOT NULL THEN 'Distributor'
          ELSE 'Unknown'
        END as user_type,
        -- Priority: ecom_user name > distributor full_name > distributor username
        COALESCE(u.name, d.full_name, d.username) as user_name, 
        COALESCE(u.phone, d.phone) as user_phone,
        COALESCE(
          (SELECT json_agg(items)::jsonb 
           FROM (
             SELECT 
               oi.id, oi.product_name, oi.product_image, 
               oi.variant_sku, oi.variant_details, 
               oi.qty, oi.unit_price, oi.total_item_price
             FROM order_items oi 
             WHERE oi.order_id = o.id
           ) items
          ), '[]'::jsonb
        ) as products,
        (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o 
      LEFT JOIN ecom_user u ON o.user_id = u.id
      LEFT JOIN users d ON o.distributor_id = d.id 
      ${whereClause}
      ORDER BY o.created_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const orders = await db.query(ordersQuery, [
      ...params,
      parseInt(limit),
      offset,
    ]);

    const totalRes = await db.query(
      `SELECT COUNT(*)::int FROM orders o ${whereClause}`,
      params,
    );

    res.json({
      success: true,
      clause: ordersQuery,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRes.rows[0].count,
        pages: Math.ceil(totalRes.rows[0].count / parseInt(limit)),
      },
      data: orders.rows,
    });
  } catch (error) {
    console.error("Error in getAllOrders:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
