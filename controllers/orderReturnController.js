const db = require("../config/db");
const { sendOrderStatusUpdateEmail } = require("./email/placeOrderEmail");

// NOTE: This project currently refunds wallet only via `transactions(category='refund', type='credit')`.
// Return workflow added here follows that same pattern.

const getOrderById = async (client, orderDbId) => {
  return client.query(`SELECT * FROM orders WHERE id = $1`, [orderDbId]);
};

const getReturnById = async (client, returnId) => {
  return client.query(`SELECT * FROM order_returns WHERE id = $1`, [returnId]);
};

const ensureOrderOwnership = (order, userId) => {
  // order.user_id is integer or null depending on schema version
  // Your current auth middleware likely sets req.user.id.
  return String(order.user_id) === String(userId);
};

const ensureOrder_D_Ownership = (order, distributor_id) => {
  // order.user_id is integer or null depending on schema version
  // Your current auth middleware likely sets req.user.id.
  return String(order.distributor_id) === String(distributor_id);
};

// Wallet refund amount should be supported by `wallets.total_amount`.
const refundToWallet = async (
  client,
  { userId, amount, orderId, returnId },
) => {
  if (!amount || Number(amount) <= 0) return;

  await client.query(
    `UPDATE wallets
     SET total_amount = total_amount + $1
     WHERE user_id = $2`,
    [amount, userId],
  );

  // Log refund transaction
  await client.query(
    `INSERT INTO transactions (user_id, amount, type, category, order_id, remarks)
     VALUES ($1, $2, 'credit', 'refund', $3, $4)`,
    [userId, amount, orderId, `Order return refund (return_id=${returnId})`],
  );
};

// NOTE: Ecom refunds should be done via Razorpay, not wallet.
// This project currently has Razorpay create/verify/webhook logic, but no refund code.
// We'll implement a DB-record-only placeholder to avoid wrong wallet refunds.
// Replace this with actual razorpay.payments/transactions refund integration.
const refundToRazorpay = async (
  client,
  {
    /* order, payment ids */
  },
) => {
  // Intentionally no-op for now.
  return;
};

const restoreInventoryForReturn = async (client, { orderId, returnItems }) => {
  // returnItems: array from order_items with product_id, variant_id, qty, stock_source
  for (const it of returnItems) {
    await client.query(
      `UPDATE distributor_inventory
       SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP
       WHERE distributor_id = $2
         AND product_id = $3
         AND (variant_id = $4 OR (variant_id IS NULL AND $4 IS NULL))`,
      [it.qty, it.stock_source, it.product_id, it.variant_id],
    );
  }
};

exports.requestReturn = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const userId = req.user.id;
    const { id: orderDbId } = req.params;
    const { reason } = req.body;

    const orderRes = await getOrderById(client, parseInt(orderDbId));
    if (orderRes.rows.length === 0) {
      throw new Error("Order not found");
    }
    const order = orderRes.rows[0];

    if (!ensureOrderOwnership(order, userId)) {
      throw new Error("Order not accessible");
    }

    // Only allow returns on delivered orders
    if (order.order_status !== "delivered") {
      throw new Error("Return allowed only for delivered orders");
    }

    // prevent multiple active returns
    const existing = await client.query(
      `SELECT * FROM order_returns
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [parseInt(orderDbId)],
    );

    if (
      existing.rows[0] &&
      !["rejected", "cancelled", "refunded"].includes(
        existing.rows[0].return_status,
      )
    ) {
      // if you want to allow re-requests after rejection only, keep this.
      throw new Error("Return already requested for this order");
    }

    const insertRes = await client.query(
      `INSERT INTO order_returns (order_id, user_id, return_reason)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [parseInt(orderDbId), userId, reason || null],
    );

    // Update order status so the rest of the system can reflect return workflow
    const result = await client.query(
      `UPDATE orders
       SET order_status = 'return_requested',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [parseInt(orderDbId)],
    );

    const orderData = result.rows[0];
    let customerEmail = null;
    let customerName = null;
    const user_query = `SELECT name, email FROM ecom_user WHERE id = $1`;
    const userRes = await db.query(user_query, [userId]);
    if (userRes.rows.length > 0) {
      customerEmail = userRes.rows[0].email;
      customerName = userRes.rows[0].name || "Customer";
    }

    // Get user data
    if (customerEmail) {
      // Wrapped inside a try/catch so that an unhandled SMTP transport failure won't crash your server thread
      try {
        const orderPayload = {
          order_id: orderData.order_id,
          customer_name: customerName,
          status: "return-requested",
        };

        await sendOrderStatusUpdateEmail(customerEmail, orderPayload);
      } catch (mailErr) {
        console.error(
          "Mail Dispatch Error (Transaction preserved):",
          mailErr.message,
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({
      success: true,
      message: "Return request created",
      data: insertRes.rows[0],
    });
  } catch (err) {
    console.log("error in return order - ", err);

    await client.query("ROLLBACK");
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

exports.dis_requestReturn = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const userId = req.user.id;
    const { id: orderDbId } = req.params;
    const { reason } = req.body;

    const orderRes = await getOrderById(client, parseInt(orderDbId));
    if (orderRes.rows.length === 0) {
      throw new Error("Order not found");
    }
    const order = orderRes.rows[0];

    if (!ensureOrder_D_Ownership(order, userId)) {
      throw new Error("Order not accessible");
    }

    // Only allow returns on delivered orders
    if (order.order_status !== "delivered") {
      throw new Error("Return allowed only for delivered orders");
    }

    // prevent multiple active returns
    const existing = await client.query(
      `SELECT * FROM order_returns
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [parseInt(orderDbId)],
    );

    if (
      existing.rows[0] &&
      !["rejected", "cancelled", "refunded"].includes(
        existing.rows[0].return_status,
      )
    ) {
      // if you want to allow re-requests after rejection only, keep this.
      throw new Error("Return already requested for this order");
    }

    const insertRes = await client.query(
      `INSERT INTO order_returns (order_id, user_id, return_reason)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [parseInt(orderDbId), userId, reason || null],
    );

    // Update order status so the rest of the system can reflect return workflow
    const result = await client.query(
      `UPDATE orders
       SET order_status = 'return_requested',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [parseInt(orderDbId)],
    );

    // NOTE: We intentionally keep the return status transition independent;
    // adminApproveReturn/warehouseReceiveReturn/refundForReturn will manage the lifecycle in order_returns.

    const orderData = result.rows[0];
    let customerEmail = null;
    let customerName = null;
    const user_query = `
        SELECT full_name AS name, email
        FROM users
        WHERE id = $1
    `;
    const userRes = await db.query(user_query, [userId]);
    if (userRes.rows.length > 0) {
      customerEmail = userRes.rows[0].email;
      customerName = userRes.rows[0].name || "Customer";
    }

    // Get user data
    if (customerEmail) {
      // Wrapped inside a try/catch so that an unhandled SMTP transport failure won't crash your server thread
      try {
        const orderPayload = {
          order_id: orderData.order_id,
          customer_name: customerName,
          status: "return-requested",
        };

        await sendOrderStatusUpdateEmail(customerEmail, orderPayload);
      } catch (mailErr) {
        console.error(
          "Mail Dispatch Error (Transaction preserved):",
          mailErr.message,
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({
      success: true,
      message: "Return request created",
      data: insertRes.rows[0],
    });
  } catch (err) {
    console.log("error in return order - ", err);

    await client.query("ROLLBACK");
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

exports.adminApproveReturn = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { returnId } = req.params;
    const { admin_remarks, refund_amount } = req.body;

    const returnRes = await getReturnById(client, parseInt(returnId));
    if (returnRes.rows.length === 0)
      throw new Error("Return request not found");

    const r = returnRes.rows[0];
    if (r.return_status !== "requested") {
      throw new Error(
        `Return is not in requested state (current=${r.return_status})`,
      );
    }

    const orderRes = await getOrderById(client, r.order_id);
    if (orderRes.rows.length === 0) throw new Error("Order not found");
    const order = orderRes.rows[0];

    if (order.order_status !== "return_requested") {
      throw new Error("Return allowed only for delivered orders");
    }

    // default refund amount = order total_amount
    const finalRefundAmount =
      refund_amount != null ? refund_amount : order.total_amount;

    const updateRes = await client.query(
      `UPDATE order_returns
       SET return_status = 'approved',
           admin_remarks = $1,
           refund_amount = $2
       WHERE id = $3
       RETURNING *`,
      [admin_remarks || null, finalRefundAmount, parseInt(returnId)],
    );

    await client.query("COMMIT");
    res.json({
      success: true,
      message: "Return approved",
      data: updateRes.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

exports.adminRejectReturn = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { returnId } = req.params;
    const { admin_remarks } = req.body;

    const returnRes = await getReturnById(client, parseInt(returnId));
    if (returnRes.rows.length === 0)
      throw new Error("Return request not found");

    const r = returnRes.rows[0];
    if (!["requested", "approved"].includes(r.return_status)) {
      throw new Error(`Cannot reject in current state=${r.return_status}`);
    }

    const updateRes = await client.query(
      `UPDATE order_returns
       SET return_status = 'rejected', admin_remarks = $1
       WHERE id = $2
       RETURNING *`,
      [admin_remarks || null, parseInt(returnId)],
    );

    await client.query("COMMIT");
    res.json({
      success: true,
      message: "Return rejected",
      data: updateRes.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

exports.warehouseReceiveReturn = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { returnId } = req.params;
    const { received_at } = req.body;

    const returnRes = await getReturnById(client, parseInt(returnId));
    if (returnRes.rows.length === 0)
      throw new Error("Return request not found");

    const r = returnRes.rows[0];
    if (r.return_status !== "approved") {
      throw new Error(
        `Return must be approved before receiving (current=${r.return_status})`,
      );
    }

    // restore inventory now (policy: inventory restoration only when received)
    const itemsRes = await client.query(
      `SELECT product_id, variant_id, qty, stock_source
       FROM order_items
       WHERE order_id = $1`,
      [r.order_id],
    );

    await restoreInventoryForReturn(client, {
      orderId: r.order_id,
      returnItems: itemsRes.rows,
    });

    const updateRes = await client.query(
      `UPDATE order_returns
       SET return_status = 'received',
           received_at = COALESCE($1, CURRENT_TIMESTAMP)
       WHERE id = $2
       RETURNING *`,
      [received_at ? new Date(received_at) : null, parseInt(returnId)],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Return marked received (inventory restored)",
      data: updateRes.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};

exports.refundForReturn = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { returnId } = req.params;
    const { admin_remarks } = req.body;

    const returnRes = await getReturnById(client, parseInt(returnId));
    if (returnRes.rows.length === 0)
      throw new Error("Return request not found");

    const r = returnRes.rows[0];

    if (r.return_status !== "received") {
      throw new Error(
        `Refund allowed only after received (current=${r.return_status})`,
      );
    }

    if (r.refund_status === "completed") {
      throw new Error("Refund already completed for this return");
    }

    const orderRes = await getOrderById(client, r.order_id);
    if (orderRes.rows.length === 0) throw new Error("Order not found");
    const order = orderRes.rows[0];

    if (order.payment_status !== "paid") {
      throw new Error("Refund allowed only for paid orders");
    }

    const amountRaw = r.refund_amount ?? order.total_amount;
    const amount = Number(amountRaw);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid refund amount");
    }

    const orderFor =
      typeof order.order_for === "string" ? order.order_for : null;
    const paymentMethod =
      typeof order.payment_method === "string" ? order.payment_method : "";

    const isRazorpay = paymentMethod.toLowerCase() === "razorpay";
    const isCOD =
      paymentMethod.toUpperCase() === "COD" ||
      paymentMethod.toLowerCase() === "cod";

    let refundUserId = null;
    console.log("order  - ", order);

    if (orderFor === "admin-distributor") {
      refundUserId = order.distributor_id;
    } else if (orderFor === "admin") {
      refundUserId = order.user_id;
    } else if (orderFor && orderFor.startsWith("distributor_")) {
      refundUserId = order.user_id;
    }

    if (!refundUserId) {
      throw new Error(
        "Unable to determine refund recipient for order_for=" + orderFor,
      );
    }

    if (isCOD || !isRazorpay) {
      await refundToWallet(client, {
        userId: refundUserId,
        amount,
        orderId: r.order_id,
        returnId: r.id,
      });
    } else {
      await refundToRazorpay(client, {
        order,
        returnId: r.id,
        amount,
        refundUserId,
      });
    }

    // FIXED: Added explicit typecast ($1::text) to resolve Postgres type ambiguity
    const updateRes = await client.query(
      `UPDATE order_returns
       SET refund_status = 'completed',
           refunded_at = CURRENT_TIMESTAMP,
           admin_remarks = COALESCE(admin_remarks, '') || CASE WHEN $1::text IS NULL THEN '' ELSE (' | ' || $1::text) END
       WHERE id = $2
       RETURNING *`,
      [admin_remarks || null, parseInt(returnId)],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Refund completed",
      data: updateRes.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.log("err in refund - ", err);

    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
};
