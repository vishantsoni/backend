const db = require("../config/db");

const generateOrderId = () => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomNum = Math.floor(Math.random() * 10000);
  return `ORD-${dateStr}-${randomNum.toString().padStart(4, "0")}`;
};

// User: Place new order (wallet payment)
exports.placeOrder = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const userId = req.user.id;
    const {
      items, // [{product_id, variant_id, qty}],
      shipping_address,
      coupon_code,
      payment_method = "wallet",
      order_for = "admin",
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Items required" });
    }

    // Determine target distributor for inventory management
    let targetDistributorId = null;

    // 1. Check explicit distributor_id in request
    if (req.body.distributor_id) {
      targetDistributorId = parseInt(req.body.distributor_id);
    }
    // 2. Check order_for field
    else if (order_for && order_for !== "admin") {
      if (order_for.startsWith("distributor_")) {
        targetDistributorId = parseInt(order_for.replace("distributor_", ""));
      } else if (!isNaN(parseInt(order_for))) {
        targetDistributorId = parseInt(order_for);
      }
    }

    // 3. Fallback to user's linked distributor_code
    if (!targetDistributorId) {
      const userRes = await client.query(
        "SELECT distributor_code FROM ecom_user WHERE id = $1",
        [userId],
      );
      const dCode = userRes.rows[0]?.distributor_code;
      if (dCode) {
        const dRes = await client.query(
          "SELECT id FROM users WHERE referral_code = $1 LIMIT 1",
          [dCode],
        );
        if (dRes.rows.length > 0) {
          targetDistributorId = dRes.rows[0].id;
        } else if (!isNaN(parseInt(dCode))) {
          const dRes2 = await client.query(
            "SELECT id FROM users WHERE id = $1 LIMIT 1",
            [parseInt(dCode)],
          );
          if (dRes2.rows.length > 0) {
            targetDistributorId = dRes2.rows[0].id;
          }
        }
      }
    }

    // 1. Validate items, calculate totals
    let subTotal = 0;
    let totalBV = 0;
    const validatedItems = [];

    for (const item of items) {
      const { product_id, variation_id: variant_id, quantity: qty } = item;

      let productData;

      if (variant_id) {
        const variant = await client.query(
          `SELECT pv.sku, pv.price, pv.bv_point, pv.stock, p.name as product_name, 
              p.f_image as product_image,
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
            WHERE pv.id = $1 AND p.status = 'active'`,
          [variant_id],
        );

        productData = variant.rows[0];
      } else {
        // --- CASE 2: Simple Product (No Variation) ---
        const productRes = await client.query(
          `SELECT 
          id::text as sku, -- Fallback to ID if SKU doesn't exist in products table
          base_price as price, 
          null as bv_point, 
          null as stock, 
          name as product_name, 
          f_image as product_image, 
          '[]'::jsonb as attributes
       FROM products 
       WHERE id = $1 AND status = 'active'`,
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

      const itemTotal = parseFloat(productData.price) * qty;
      const itemBV = (productData.bv_point || 0) * qty;

      validatedItems.push({
        product_id,
        variant_id: variant_id || null,
        product_name: productData.product_name,
        product_image: productData.product_image,
        variant_sku: productData.sku,
        variant_details: {
          price: productData.price,
          bv_point: productData.bv_point,
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
    }

    // Inventory check for distributor orders
    if (targetDistributorId) {
      for (const item of validatedItems) {
        const invRes = await client.query(
          `SELECT quantity FROM distributor_inventory
           WHERE distributor_id = $1 AND product_id = $2 AND COALESCE(variant_id, 0) = COALESCE($3, 0)`,
          [targetDistributorId, item.product_id, item.variant_id],
        );
        const availableQty = invRes.rows[0]?.quantity || 0;
        if (availableQty < item.qty) {
          throw new Error(
            `Insufficient inventory for ${item.product_name}. Available: ${availableQty}, Required: ${item.qty}`,
          );
        }
      }
    }

    // 2. Tax (simple 18% GST for now, link to tax_settings later)
    const taxRate = 0.18;
    const taxAmount = subTotal * taxRate;

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

    // 5. Check wallet balance
    // const wallet = await client.query(
    //   "SELECT COALESCE(total_amount, 0) + COALESCE(pending_amount, 0) as available FROM wallets WHERE user_id = $1",
    //   [userId],
    // );
    // const available = parseFloat(wallet.rows[0]?.available || 0);
    // if (available < totalAmount) {
    //   throw new Error("Insufficient wallet balance");
    // }

    // 6. Deduct from wallet (total_amount for simplicity)
    // await client.query(
    //   "UPDATE wallets SET total_amount = total_amount - $1 WHERE user_id = $2",
    //   [totalAmount, userId],
    // );

    // 7. Create order
    const orderId = generateOrderId();
    const newOrder = await client.query(
      `INSERT INTO orders (order_id, user_id, distributor_id, sub_total, tax_amount, shipping_charges, total_amount, total_bv_points, shipping_address, payment_method, order_for)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        orderId,
        userId,
        targetDistributorId || null,
        subTotal,
        taxAmount,
        shippingCharges,
        totalAmount,
        totalBV,
        shipping_address,
        payment_method,
        order_for,
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

    // 9. Auto-decrease distributor inventory for distributor orders
    if (targetDistributorId) {
      for (const item of validatedItems) {
        const updateRes = await client.query(
          `UPDATE distributor_inventory
           SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
           WHERE distributor_id = $2 AND product_id = $3 AND COALESCE(variant_id, 0) = COALESCE($4, 0)
           RETURNING *`,
          [item.qty, targetDistributorId, item.product_id, item.variant_id],
        );
        if (updateRes.rowCount === 0) {
          throw new Error(
            `Inventory record not found for ${item.product_name}. Cannot fulfill order.`,
          );
        }
      }
    }

    await client.query("COMMIT");

    res.status(200).json({
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

// User/Admin: Get my orders
exports.getMyOrders = async (req, res) => {
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

// Admin: Get all orders

exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, filter = "all" } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = "WHERE 1=1";
    const params = [];

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
        params.push(filter);
        whereClause += ` AND o.order_for = $${params.length}`;
      }
    }

    // const ordersQuery = `
    //   SELECT
    //     o.*,
    //     CASE
    //       WHEN o.user_id IS NOT NULL THEN 'User'
    //       WHEN o.distributor_id IS NOT NULL THEN 'Distributor'
    //       ELSE 'Unknown'
    //     END as user_type,
    //     -- Pick distributor name if user_name is null, and vice versa
    //     COALESCE(u.name, d.full_name, d.username) as user_name,
    //     COALESCE(u.phone, d.phone) as user_phone,

    //     COALESCE(
    //       (SELECT json_agg(items)::jsonb
    //       FROM (
    //         SELECT
    //           oi.id,
    //           oi.product_name,
    //           oi.product_image,
    //           oi.variant_sku,
    //           oi.variant_details,
    //           oi.qty,
    //           oi.unit_price,
    //           oi.total_item_price
    //         FROM order_items oi
    //         WHERE oi.order_id = o.id
    //       ) items
    //       ), '[]'::jsonb
    //     ) as products,
    //     (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) as item_count
    //   FROM orders o
    //   -- Use LEFT JOIN because an order might not have one of these
    //   LEFT JOIN ecom_user u ON o.user_id = u.id
    //   LEFT JOIN users d ON o.distributor_id = d.id
    //   ${whereClause}
    //   ORDER BY o.created_at DESC
    //   LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    // `;

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

// exports.getAllOrders = async (req, res) => {
//   try {
//     const { page = 1, limit = 20, status } = req.query;

//     const offset = (parseInt(page) - 1) * parseInt(limit);
//     let whereClause = "WHERE 1=1";
//     const params = [];

//     if (status) {
//       params.push(status);
//       whereClause += ` AND o.order_status = $${params.length}`;
//     }

//     // if (user_id) {
//     //   params.push(user_id);
//     //   whereClause += ` AND o.user_id = $${params.length}`;
//     // }

//     const ordersQuery = `
//       SELECT o.*,
//              u.name, u.phone,
//              COUNT(oi.id)::int as item_count,
//              oi.product_name, oi.product_image, oi.variant_details
//       FROM orders o
//       JOIN ecom_user u ON o.user_id = u.id
//       LEFT JOIN order_items oi ON o.id = oi.order_id
//       ${whereClause}
//       GROUP BY o.id, u.name, u.phone , oi.product_name, oi.product_image, oi.variant_details
//       ORDER BY o.created_at DESC
//       LIMIT $${params.length + 1} OFFSET $${params.length + 2}
//     `;

//     const orders = await db.query(ordersQuery, [
//       ...params,
//       parseInt(limit),
//       offset,
//     ]);

//     const totalRes = await db.query(
//       `SELECT COUNT(DISTINCT o.id)::int FROM orders o ${whereClause}`,
//       params,
//     );

//     res.json({
//       success: true,
//       data: orders.rows,
//       pagination: {
//         page: parseInt(page),
//         limit: parseInt(limit),
//         total: parseInt(totalRes.rows[0].count),
//         pages: Math.ceil(parseInt(totalRes.rows[0].count) / parseInt(limit)),
//       },
//     });
//   } catch (error) {
//     console.error("Error in getAllOrders:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

// Admin/User: Get order detail
exports.getOrderDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
       SELECT 
    o.id, 
    o.*, 
    CASE 
        WHEN o.user_id IS NOT NULL THEN 'User'
        WHEN o.distributor_id IS NOT NULL THEN 'Distributor'
        ELSE 'Unknown'
    END as user_type,
    COALESCE(u.name, d.full_name, d.username) as user_name, 
    COALESCE(u.phone, d.phone) as user_phone,
    json_agg(
        json_build_object(
            'id', oi.id,
            'product_name', oi.product_name, 
            'product_image', oi.product_image, 
            'variant_sku', oi.variant_sku, 
            'variant_details', oi.variant_details, 
            'qty', oi.qty, 
            'price', oi.unit_price, 
            -- Extracting tax percentage from JSON and calculating
            'tax_amount', ROUND(
                (oi.unit_price * COALESCE((oi.variant_details->'tax_data'->>'percentage')::numeric, 0) / 100)::numeric, 
                2
            ),
            'unit_price', ROUND(
                (oi.unit_price * (1 + COALESCE((oi.variant_details->'tax_data'->>'percentage')::numeric, 0) / 100))::numeric, 
                2
            ),
            'total_item_price', oi.total_item_price
        )
    ) FILTER (WHERE oi.id IS NOT NULL) as items 
FROM orders o 
LEFT JOIN ecom_user u ON o.user_id = u.id 
LEFT JOIN users d ON o.distributor_id = d.id 
LEFT JOIN order_items oi ON o.id = oi.order_id 
WHERE o.order_id = $1
GROUP BY o.id, u.id, d.id;
    `;

    const order = await db.query(query, [id]);

    if (order.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, query, message: "Order not found" });
    }

    res.json({ success: true, data: order.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Admin: Update order status (e.g., shipped -> triggers commissions?)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { order_status, payment_status, remarks } = req.body;

    // Validate status transitions (simple)
    const validStatuses = [
      "pending",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(order_status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const result = await db.query(
      "UPDATE orders SET order_status = $1, payment_status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *",
      [order_status, payment_status || "paid", parseInt(id)],
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // TODO: If 'delivered', trigger commissions to uplines based on total_bv_points

    res.json({
      success: true,
      message: "Order status updated",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Admin: Cancel order (refund if paid)
exports.cancelOrder = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const order = await client.query("SELECT * FROM orders WHERE id = $1", [
      parseInt(id),
    ]);

    if (order.rows.length === 0 || order.rows[0].order_status === "cancelled") {
      throw new Error("Order not found or already cancelled");
    }

    const o = order.rows[0];
    if (o.payment_status === "paid") {
      // Refund to wallet
      await client.query(
        "UPDATE wallets SET total_amount = total_amount + $1 WHERE user_id = $2",
        [o.total_amount, o.user_id],
      );
      // Log refund txn
      await client.query(
        `INSERT INTO transactions (user_id, amount, type, category, order_id, remarks)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          o.user_id,
          o.total_amount,
          "credit",
          "refund",
          o.id,
          "Order cancelled refund",
        ],
      );
    }

    await client.query(
      "UPDATE orders SET order_status = 'cancelled', payment_status = 'cancelled' WHERE id = $1",
      [parseInt(id)],
    );

    await client.query("COMMIT");
    res.json({ success: true, message: "Order cancelled successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
};
