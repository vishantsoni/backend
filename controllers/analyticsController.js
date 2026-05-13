const db = require("../config/db");

const safeQuery = async (query, params = []) => {
  try {
    const result = await db.query(query, params);
    return { success: true, rows: result.rows };
  } catch (error) {
    console.error("Analytics query error:", error.message);
    return { success: false, rows: [] };
  }
};

const buildDateRangeClause = ({ from, to, alias = "o" }) => {
  const params = [];
  let clause = "";

  if (from) {
    params.push(from);
    clause += ` AND ${alias}.created_at >= $${params.length}`;
  }

  if (to) {
    params.push(to);
    clause += ` AND ${alias}.created_at <= $${params.length}::timestamptz`;
  }

  return { clause, params };
};

// @desc    Get top analytics lists: top selling product, top distributor, top ecom user
// @route   GET /api/analytics/top
// @access  Admin/SuperAdmin
exports.getTopAnalytics = async (req, res) => {
  try {
    const { from, to } = req.query;

    // Base date filter applies to orders.
    const { clause: dateClause, params: dateParams } = buildDateRangeClause({
      from,
      to,
      alias: "o",
    });

    // 1) Top selling products (by qty sold on paid orders)
    const topSellingProductsQuery = `
      SELECT
        oi.product_id,
        oi.product_name,
        SUM(oi.qty)::int as total_qty_sold,
        COUNT(DISTINCT oi.order_id)::int as total_orders,
        COALESCE(SUM(oi.total_item_price), 0)::numeric(12,2) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.payment_status = 'paid'
      ${dateClause}
      GROUP BY oi.product_id, oi.product_name
      ORDER BY total_qty_sold DESC
      LIMIT 10
    `;

    // 2) Top distributors (by revenue/orders on distributor orders)
    // NOTE: Existing codebase uses orders.order_for like 'distributor_%'.
    // We rely on that column being present.
    const topDistributorsQuery = `
      SELECT
        o.distributor_id,
        d.id as distributor_name,
        COUNT(DISTINCT o.id)::int as total_orders,
        COALESCE(SUM(o.total_amount), 0)::numeric(12,2) as total_revenue
      FROM orders o
      LEFT JOIN users d ON o.distributor_id = d.id
      WHERE o.payment_status = 'paid'
        AND o.distributor_id IS NOT NULL
        AND (o.order_for = 'admin)
      ${dateClause}
      GROUP BY o.distributor_id, distributor_name
      ORDER BY total_revenue DESC
      LIMIT 10
    `;

    // 3) Top ecom users (by revenue/orders on non-distributor orders)
    const topEcomUsersQuery = `
      SELECT
        eu.phone as ecom_user_id,
        COALESCE(eu.name, eu.phone) as ecom_user_name,
        COUNT(DISTINCT o.id)::int as total_orders,
        COALESCE(SUM(o.total_amount), 0)::numeric(12,2) as total_revenue
      FROM orders o
      LEFT JOIN ecom_user eu ON o.user_id = eu.id
      WHERE o.payment_status = 'paid'
        AND o.user_id IS NOT NULL
        AND (o.order_for NOT LIKE 'distributor_%' OR o.order_for IS NULL)
      ${dateClause}
      GROUP BY o.user_id, ecom_user_name, eu.phone
      ORDER BY total_revenue DESC
      LIMIT 10
    `;

    const [topSellingProductsRes, topDistributorsRes, topEcomUsersRes] =
      await Promise.all([
        safeQuery(topSellingProductsQuery, dateParams),
        safeQuery(topDistributorsQuery, dateParams),
        safeQuery(topEcomUsersQuery, dateParams),
      ]);

    return res.json({
      success: true,
      data: {
        top_selling_products: topSellingProductsRes.rows,
        top_distributors: topDistributorsRes.rows,
        top_ecom_users: topEcomUsersRes.rows,
      },
      message: "Top analytics fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching top analytics:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
