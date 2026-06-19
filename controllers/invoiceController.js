const path = require("path");
const db = require("../config/db"); // Replace with your actual DB pool configuration path
const { getOrCreateInvoicePdf } = require("../utils/invoiceServiceNew");

async function generateInvoice(req, res) {
  try {
    const userId = req.user?.id;
    const { orderId } = req.body || req.query || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required to generate invoice",
      });
    }

    // Fetch complete contextual single order profile matching database schema queries
    const orderQuery = `
      SELECT 
        o.*, 
        CASE 
          WHEN o.user_id IS NOT NULL THEN 'User'
          WHEN o.distributor_id IS NOT NULL THEN 'Distributor'
          ELSE 'Unknown'
        END as user_type,
        COALESCE(u.name, d.full_name, d.username) as user_name, 
        COALESCE(u.phone, d.phone) as user_phone,
        CASE 
          WHEN o.distributor_id IS NOT NULL THEN 
            JSON_BUILD_OBJECT(
              'id', d.id,
              'name', COALESCE(d.full_name, d.username),
              'phone', d.phone,
              'username', d.username
            )
          ELSE NULL 
        END as distributor,
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
        ) as products
      FROM orders o 
      LEFT JOIN ecom_user u ON o.user_id = u.id
      LEFT JOIN users d ON o.distributor_id = d.id 
      WHERE o.order_id = $1 LIMIT 1;
    `;

    const dbResult = await db.query(orderQuery, [orderId]);
    const orderData = dbResult.rows[0];

    if (!orderData) {
      return res.status(404).json({
        success: false,
        message: "Order details record not found",
      });
    }

    const force =
      String(req.query.force || req.body?.force || "false").toLowerCase() ===
      "true";

    const templatePath = path.join(
      process.cwd(),
      "invoice_temp",
      "template.pdf",
    );

    // Call service layer supplying fetched database single row profile directly
    const result = await getOrCreateInvoicePdf({
      order: orderData,
      force,
      templatePath,
    });

    return res.json({
      success: true,
      statusCode: 200,
      url: result.url,
      created: result.created,
      data: {
        orderId: orderData.id,
        invoiceNo: orderData.invoice_no || `ORD_${orderData.id}`,
        created_at: orderData.created_at,
      },
      orderData: orderData,
    });
  } catch (err) {
    console.error("Invoice generation error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error generating dynamic order invoice",
    });
  }
}

module.exports = {
  generateInvoice,
};
