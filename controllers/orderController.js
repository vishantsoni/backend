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

    for (const item of items) {
      const { product_id, variation_id: variant_id, quantity: qty } = item;
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

      if (variant.rows.length === 0) {
        throw new Error(`Invalid variant: ${variant_id}`);
      }

      const v = variant.rows[0];
      const itemTotal = parseFloat(v.price) * qty;
      const itemBV = v.bv_point * qty;

      validatedItems.push({
        product_id,
        variant_id,
        product_name: v.product_name,
        product_image: v.product_image,
        variant_sku: v.sku,
        variant_details: {
          price: v.price,
          bv_point: v.bv_point,
          attributes: v.attributes || [],
        },
        qty,
        unit_price: v.price,
        unit_bv_points: v.bv_point,
        total_item_price: itemTotal,
        total_item_bv: itemBV,
      });

      subTotal += itemTotal;
      totalBV += itemBV;
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
      `INSERT INTO orders (order_id, user_id, sub_total, tax_amount, shipping_charges, total_amount, total_bv_points, shipping_address, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
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

    // 9. Log transaction
    // await client.query(
    //   `INSERT INTO transactions (user_id, amount, type, category, order_id, remarks, status)
    //    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    //   [
    //     userId,
    //     totalAmount,
    //     "debit",
    //     "purchase",
    //     newOrder.rows[0].id,
    //     `Order ${orderId}`,
    //     "completed",
    //   ],
    // );

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

    // if (filter && filter !== "distributor") {
    //   // params.push(status);
    //   whereClause += ` AND o.payment_method == 'wallet'`;
    // }

    // const ordersQuery = `
    //   SELECT
    //     o.*,
    //     u.name as user_name,
    //     u.phone as user_phone,
    //     -- Sabhi items ko ek array mein merge kar rahe hain
    //     COALESCE(
    //       (SELECT json_agg(items)
    //        FROM (
    //          SELECT
    //            oi.id,
    //            oi.product_name,
    //            oi.product_image,
    //            oi.variant_sku,
    //            oi.variant_details,
    //            oi.qty,
    //            oi.unit_price,
    //            oi.total_item_price
    //          FROM order_items oi
    //          WHERE oi.order_id = o.id
    //        ) items
    //       ), '[]'::jsonb
    //     ) as products,
    //     -- Total items count calculate karne ke liye
    //     (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) as item_count
    //   FROM orders o
    //   JOIN ecom_user u ON o.user_id = u.id
    //   ${whereClause}
    //   ORDER BY o.created_at DESC
    //   LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    // `;

    const ordersQuery = `
      SELECT 
        o.*, 
        u.name as user_name, 
        u.phone as user_phone,
        -- json_agg ko explicitly ::jsonb mein cast kiya gaya hai
        COALESCE(
          (SELECT json_agg(items)::jsonb 
           FROM (
             SELECT 
               oi.id, 
               oi.product_name, 
               oi.product_image, 
               oi.variant_sku, 
               oi.variant_details, 
               oi.qty, 
               oi.unit_price,
               oi.total_item_price
             FROM order_items oi 
             WHERE oi.order_id = o.id
           ) items
          ), '[]'::jsonb
        ) as products,
        (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o 
      JOIN ecom_user u ON o.user_id = u.id
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
      data: orders.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRes.rows[0].count,
        pages: Math.ceil(totalRes.rows[0].count / parseInt(limit)),
      },
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
    const order = await db.query(
      `
      SELECT o.*, u.name, u.phone,
             json_agg(json_build_object(
               'product_name', oi.product_name,
               'product_image', oi.product_image,
               'variant_sku', oi.variant_sku,
               'variant_details', oi.variant_details,
               'qty', oi.qty,
               'unit_price', oi.unit_price,
               'total_item_price', oi.total_item_price
             )) as items
      FROM orders o 
      JOIN ecom_user u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.order_id = $1 
      GROUP BY o.id, u.id, u.phone
    `,
      [id],
    );

    if (order.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    res.json({ success: true, data: order.rows[0] });
  } catch (error) {
    // console.error(error.message);
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
