const pool = require("../../../config/db");

async function trackOrder({ orderId, authContext }) {
  const { ecomUserId } = authContext;
  if (!orderId) return { order: null, items: [], payment: null };

  const orderRes = await pool.query(
    `SELECT
      o.id,
      o.order_id,
      o.order_status,
      o.payment_status,
      o.payment_method,
      o.total_amount,
      o.total_bv_points,
      o.shipping_address,
      o.created_at,
      o.updated_at,
      o.commission_status,
      o.order_for,
      o.distributor_id
     FROM public.orders o
     WHERE o.user_id = $1::uuid
       AND o.order_id = $2
     LIMIT 1`,
    [ecomUserId, orderId],
  );

  if (orderRes.rowCount === 0) return { order: null, items: [], payment: null };
  const order = orderRes.rows[0];

  const itemsRes = await pool.query(
    `SELECT
      oi.id,
      oi.product_id,
      oi.product_name,
      oi.variant_id,
      oi.variant_sku,
      oi.variant_details,
      oi.qty,
      oi.unit_price,
      oi.unit_bv_points,
      oi.total_item_price,
      oi.total_item_bv,
      oi.product_image,
      oi.stock_source
     FROM public.order_items oi
     JOIN public.orders o ON o.id = oi.order_id
     WHERE o.user_id = $1::uuid
       AND o.order_id = $2
     ORDER BY oi.id ASC`,
    [ecomUserId, orderId],
  );

  let payment = null;
  try {
    const paymentRes = await pool.query(
      `SELECT
        ep.id,
        ep.order_id,
        ep.payment_method,
        ep.transaction_id,
        ep.amount,
        ep.status,
        ep.paid_at,
        ep.created_at,
        ep.updated_at
       FROM public.e_payments ep
       JOIN public.orders o ON ep.order_id = o.id::uuid
       WHERE o.user_id = $1::uuid
         AND o.order_id = $2
       LIMIT 1`,
      [ecomUserId, orderId],
    );
    payment = paymentRes.rows[0] || null;
  } catch (e) {
    payment = null;
  }

  return { order, items: itemsRes.rows, payment };
}

async function getOrderStatus({ orderId, authContext }) {
  const { ecomUserId } = authContext;
  if (!orderId) return { order: null };

  const res = await pool.query(
    `SELECT
      o.id,
      o.order_id,
      o.order_status,
      o.payment_status,
      o.created_at,
      o.updated_at
     FROM public.orders o
     WHERE o.user_id = $1::uuid
       AND o.order_id = $2
     LIMIT 1`,
    [ecomUserId, orderId],
  );

  return { order: res.rows[0] || null };
}

async function getMyAddresses({ authContext }) {
  const { ecomUserId } = authContext;

  const res = await pool.query(
    `SELECT
      id,
      full_name,
      phone,
      address_line1,
      address_line2,
      city,
      state,
      country,
      pincode,
      landmark,
      is_default,
      created_at,
      updated_at
     FROM public.e_user_addresses
     WHERE user_id = $1::uuid
     ORDER BY is_default DESC, created_at DESC`,
    [ecomUserId],
  );

  return res.rows;
}

async function getMyWishlist({ authContext }) {
  const { ecomUserId } = authContext;

  const res = await pool.query(
    `SELECT
      w.id,
      w.product_id,
      p.name,
      p.slug,
      p.f_image,
      p.g_image,
      w.created_at
     FROM public.e_wishlists w
     JOIN public.products p ON p.id = w.product_id
     WHERE w.user_id = $1::uuid
     ORDER BY w.created_at DESC`,
    [ecomUserId],
  );

  return res.rows;
}

const ecomTools = {
  trackOrder,
  getOrderStatus,
  getMyAddresses,
  getMyWishlist,
};

module.exports = { ecomTools };
