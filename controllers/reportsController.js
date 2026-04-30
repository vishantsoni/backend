const db = require("../config/db");

// Helper to build date range clause
const buildDateRange = (from, to, alias = "o") => {
  let clause = "";
  const params = [];
  if (from) {
    params.push(from);
    clause += ` AND ${alias}.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    clause += ` AND ${alias}.created_at::date = $${params.length}::date`;
  }
  return { clause, params };
};

// @desc    Get Sales Report
// @route   GET /api/reports/sales
exports.getSalesReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    // 1. Overall sales summary
    const summaryQuery = `
      SELECT 
        COUNT(*)::int as total_orders,
        COALESCE(SUM(total_amount), 0)::numeric(12,2) as total_revenue,
        COALESCE(SUM(sub_total), 0)::numeric(12,2) as total_sub_total,
        COALESCE(SUM(tax_amount), 0)::numeric(12,2) as total_tax,
        COALESCE(SUM(shipping_charges), 0)::numeric(12,2) as total_shipping,
        COALESCE(SUM(total_bv_points), 0)::int as total_bv_points,
        COALESCE(AVG(total_amount), 0)::numeric(12,2) as avg_order_value
      FROM orders o
      WHERE 1=1
    `;

    const summaryResult = await db.query(summaryQuery);

    // 2. Order status breakdown
    const statusQuery = `
      SELECT 
        order_status,
        COUNT(*)::int as count,
        COALESCE(SUM(total_amount), 0)::numeric(12,2) as revenue
      FROM orders o
      WHERE 1=1
      GROUP BY order_status
      ORDER BY count DESC
    `;
    const statusResult = await db.query(statusQuery);

    // 3. Payment status breakdown
    const paymentStatusQuery = `
      SELECT 
        payment_status,
        COUNT(*)::int as count,
        COALESCE(SUM(total_amount), 0)::numeric(12,2) as revenue
      FROM orders o
      WHERE 1=1
      GROUP BY payment_status
      ORDER BY count DESC
    `;
    const paymentStatusResult = await db.query(paymentStatusQuery);

    // 4. Daily sales trend (last 30 days or filtered range)
    const salesTrendQuery = `
      SELECT 
        COALESCE(DATE(o.created_at), CURRENT_DATE) as date,
        COUNT(*)::int as orders,
        COALESCE(SUM(o.total_amount), 0)::numeric(12,2) as revenue,
        COALESCE(SUM(oi.total_item_bv), 0)::int as bv_points
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE 1=1
      GROUP BY DATE(o.created_at)
      ORDER BY date DESC
    `;
    const salesTrendResult = await db.query(salesTrendQuery);

    // 5. Top selling products
    const topProductsQuery = `
      SELECT 
        oi.product_id,
        oi.product_name,
        SUM(oi.qty)::int as total_qty_sold,
        COUNT(DISTINCT oi.order_id)::int as total_orders,
        COALESCE(SUM(oi.total_item_price), 0)::numeric(12,2) as total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE 1=1
      GROUP BY oi.product_id, oi.product_name
      ORDER BY total_qty_sold DESC
      LIMIT 10
    `;
    const topProductsResult = await db.query(topProductsQuery);

    return res.json({
      success: true,
      data: {
        summary: summaryResult.rows[0],
        status_breakdown: statusResult.rows,
        payment_status_breakdown: paymentStatusResult.rows,
        daily_trend: salesTrendResult.rows,
        top_products: topProductsResult.rows,
      },
    });
  } catch (error) {
    console.error("Error fetching sales report:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get Profit & Loss Report
// @route   GET /api/reports/profit-loss
exports.getProfitLossReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    // 1. Total Revenue from Orders (Income)
    const orderRevenueQuery = `
      SELECT 
        COALESCE(SUM(total_amount), 0)::numeric(12,2) as total_order_revenue,
        COALESCE(SUM(sub_total), 0)::numeric(12,2) as total_sub_total,
        COALESCE(SUM(tax_amount), 0)::numeric(12,2) as total_tax_collected,
        COALESCE(SUM(shipping_charges), 0)::numeric(12,2) as total_shipping_collected
      FROM orders o
      WHERE payment_status = 'paid'
    `;
    const orderRevenueResult = await db.query(orderRevenueQuery);

    // 2. Total Revenue from Package Purchases (Income)
    const packageRevenueQuery = `
      SELECT 
        COALESCE(SUM(amount), 0)::numeric(12,2) as total_package_revenue,
        COUNT(*)::int as total_package_sales
      FROM user_packages up
      WHERE status = 'activated'
    `;
    const packageRevenueResult = await db.query(packageRevenueQuery);

    // 3. Total Commissions Paid (Expense)
    const commissionsQuery = `
      SELECT 
        COALESCE(SUM(amount), 0)::numeric(12,2) as total_commissions,
        COUNT(*)::int as total_commission_transactions
      FROM transactions t
      WHERE t.category = 'commission' AND t.type = 'credit'
    `;
    const commissionsResult = await db.query(commissionsQuery);

    // 4. Total Withdrawals (Expense)
    const withdrawalsQuery = `
      SELECT 
        COALESCE(SUM(amount), 0)::numeric(12,2) as total_withdrawals,
        COUNT(*)::int as total_withdrawal_transactions
      FROM transactions t
      WHERE t.category = 'withdraw' AND t.type = 'debit'
    `;
    const withdrawalsResult = await db.query(withdrawalsQuery);

    // 5. Total Refunds (Expense)
    const refundsQuery = `
      SELECT 
        COALESCE(SUM(amount), 0)::numeric(12,2) as total_refunds,
        COUNT(*)::int as total_refund_transactions
      FROM transactions t
      WHERE t.category = 'refund' AND t.type = 'credit'
    `;
    const refundsResult = await db.query(refundsQuery);

    // 6. Monthly P&L Trend
    const monthlyTrendQuery = `
      SELECT 
        DATE_TRUNC('month', o.created_at) as month,
        SUM(o.total_amount)::numeric(12,2) as revenue
      FROM orders o
      WHERE o.payment_status = 'paid'
      GROUP BY DATE_TRUNC('month', o.created_at)
      ORDER BY month DESC
      LIMIT 12
    `;
    const monthlyTrendResult = await db.query(monthlyTrendQuery);

    // Calculate Totals
    const totalIncome =
      parseFloat(orderRevenueResult.rows[0]?.total_order_revenue || 0) +
      parseFloat(packageRevenueResult.rows[0]?.total_package_revenue || 0);

    const totalExpense =
      parseFloat(commissionsResult.rows[0]?.total_commissions || 0) +
      parseFloat(withdrawalsResult.rows[0]?.total_withdrawals || 0) +
      parseFloat(refundsResult.rows[0]?.total_refunds || 0);

    const netProfit = totalIncome - totalExpense;

    return res.json({
      success: true,
      data: {
        income: {
          order_revenue: orderRevenueResult.rows[0],
          package_revenue: packageRevenueResult.rows[0],
          total_income: totalIncome.toFixed(2),
        },
        expenses: {
          commissions: commissionsResult.rows[0],
          withdrawals: withdrawalsResult.rows[0],
          refunds: refundsResult.rows[0],
          total_expense: totalExpense.toFixed(2),
        },
        summary: {
          total_income: totalIncome.toFixed(2),
          total_expense: totalExpense.toFixed(2),
          net_profit: netProfit.toFixed(2),
          profit_margin:
            totalIncome > 0
              ? ((netProfit / totalIncome) * 100).toFixed(2) + "%"
              : "0%",
        },
        monthly_trend: monthlyTrendResult.rows,
      },
      message: "Profit & Loss report fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching profit/loss report:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get Purchase Report
// @route   GET /api/reports/purchase
exports.getPurchaseReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    // 1. Overall purchase summary
    const summaryQuery = `
      SELECT 
        COUNT(*)::int as total_purchases,
        COALESCE(SUM(amount), 0)::numeric(12,2) as total_revenue,
        COALESCE(AVG(amount), 0)::numeric(12,2) as avg_purchase_value
      FROM user_packages up
      WHERE status = 'activated'
    `;
    const summaryResult = await db.query(summaryQuery);

    // 2. Purchase by package
    const byPackageQuery = `
      SELECT 
        up.package_id,
        p.name as package_name,
        COUNT(*)::int as total_purchases,
        COALESCE(SUM(up.amount), 0)::numeric(12,2) as total_revenue
      FROM user_packages up
      LEFT JOIN packages p ON up.package_id = p.id
      WHERE up.status = 'activated'
      GROUP BY up.package_id, p.name
      ORDER BY total_purchases DESC
    `;
    const byPackageResult = await db.query(byPackageQuery);

    // 3. Purchase by payment method
    const byPaymentMethodQuery = `
      SELECT 
        up.payment_method,
        COUNT(*)::int as total_purchases,
        COALESCE(SUM(up.amount), 0)::numeric(12,2) as total_revenue
      FROM user_packages up
      WHERE up.status = 'activated'
      GROUP BY up.payment_method
      ORDER BY total_purchases DESC
    `;
    const byPaymentMethodResult = await db.query(byPaymentMethodQuery);

    // 4. Monthly purchase trend
    const monthlyTrendQuery = `
      SELECT 
        DATE_TRUNC('month', up.activated_at) as month,
        COUNT(*)::int as purchases,
        COALESCE(SUM(up.amount), 0)::numeric(12,2) as revenue
      FROM user_packages up
      WHERE up.status = 'activated'
      GROUP BY DATE_TRUNC('month', up.activated_at)
      ORDER BY month DESC
      LIMIT 12
    `;
    const monthlyTrendResult = await db.query(monthlyTrendQuery);

    // 5. Daily trend (last 30 days)
    const dailyTrendQuery = `
      SELECT 
        COALESCE(DATE(up.activated_at), CURRENT_DATE) as date,
        COUNT(*)::int as purchases,
        COALESCE(SUM(up.amount), 0)::numeric(12,2) as revenue
      FROM user_packages up
      WHERE up.status = 'activated'
      GROUP BY DATE(up.activated_at)
      ORDER BY date DESC
      LIMIT 30
    `;
    const dailyTrendResult = await db.query(dailyTrendQuery);

    // 6. Top purchasers
    const topPurchasersQuery = `
      SELECT 
        up.user_id,
        u.full_name,
        u.username,
        u.phone,
        COUNT(*)::int as total_purchases,
        COALESCE(SUM(up.amount), 0)::numeric(12,2) as total_spent
      FROM user_packages up
      LEFT JOIN users u ON up.user_id = u.id
      WHERE up.status = 'activated'
      GROUP BY up.user_id, u.full_name, u.username, u.phone
      ORDER BY total_spent DESC
      LIMIT 10
    `;
    const topPurchasersResult = await db.query(topPurchasersQuery);

    return res.json({
      success: true,
      data: {
        summary: summaryResult.rows[0],
        by_package: byPackageResult.rows,
        by_payment_method: byPaymentMethodResult.rows,
        monthly_trend: monthlyTrendResult.rows,
        daily_trend: dailyTrendResult.rows,
        top_purchasers: topPurchasersResult.rows,
      },
      message: "Purchase report fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching purchase report:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Get GST Report
// @route   GET /api/reports/gst
// exports.getGSTReport = async (req, res) => {
//   try {
//     const { from, to } = req.query;
//     const { id: userId, role } = req.user;
//     const { clause: dateClause, params: dateParams } = buildDateRange(
//       from,
//       to,
//       "o",
//     );

//     let roleClause = "";
//     let roleParams = [];

//     if (role !== 'super_admin') {
//       roleClause = ` AND o.distributor_id = $${dateParams.length + 1}`;
//       roleParams = [userId];
//     }
//     const queryParams = [...dateParams, ...roleParams];

//     // 1. Overall GST Summary
//     const summaryQuery = `
//       SELECT
//         COUNT(*)::int as total_orders,
//         COALESCE(SUM(o.sub_total), 0)::numeric(12,2) as total_taxable_value,
//         COALESCE(SUM(o.tax_amount), 0)::numeric(12,2) as total_gst_collected,
//         COALESCE(SUM(o.total_amount), 0)::numeric(12,2) as total_amount,
//         COALESCE(AVG(o.tax_amount), 0)::numeric(12,2) as avg_gst_per_order
//       FROM orders o
//       WHERE o.payment_status = 'paid'
//       ${dateClause} ${roleClause}
//     `;
//     const summaryResult = await db.query(summaryQuery, [queryParams]);

//     // 2. GST by Tax Slab (from product tax_settings)
//     const taxSlabQuery = `
//       SELECT
//         COALESCE(ts.tax_percentage, 0)::numeric(5,2) as tax_rate,
//         COUNT(DISTINCT o.id)::int as total_orders,
//         COALESCE(SUM(oi.total_item_price), 0)::numeric(12,2) as taxable_value,
//         COALESCE(SUM(oi.total_item_price * COALESCE(ts.tax_percentage, 0) / 100), 0)::numeric(12,2) as gst_amount
//       FROM orders o
//       JOIN order_items oi ON o.id = oi.order_id
//       LEFT JOIN products p ON oi.product_id = p.id
//       LEFT JOIN tax_settings ts ON p.tax_id = ts.id
//       WHERE o.payment_status = 'paid'
//       ${dateClause}
//       GROUP BY ts.tax_percentage
//       ORDER BY tax_rate DESC
//     `;
//     const taxSlabResult = await db.query(taxSlabQuery, [...dateParams]);

//     // 3. Monthly GST Trend
//     const monthlyTrendQuery = `
//       SELECT
//         DATE_TRUNC('month', o.created_at) as month,
//         COUNT(*)::int as orders,
//         COALESCE(SUM(o.sub_total), 0)::numeric(12,2) as taxable_value,
//         COALESCE(SUM(o.tax_amount), 0)::numeric(12,2) as gst_collected,
//         COALESCE(SUM(o.total_amount), 0)::numeric(12,2) as total_amount
//       FROM orders o
//       WHERE o.payment_status = 'paid'
//       ${dateClause}
//       GROUP BY DATE_TRUNC('month', o.created_at)
//       ORDER BY month DESC
//       LIMIT 12
//     `;
//     const monthlyTrendResult = await db.query(monthlyTrendQuery, [
//       ...dateParams,
//     ]);

//     // 4. GST by Order (Top orders with highest GST)
//     const topOrdersQuery = `
//       SELECT
//         o.order_id,
//         o.created_at,
//         COALESCE(u.name, d.full_name, d.username) as customer_name,
//         o.sub_total::numeric(12,2) as taxable_value,
//         o.tax_amount::numeric(12,2) as gst_amount,
//         o.total_amount::numeric(12,2) as total_amount,
//         CASE
//           WHEN o.order_for LIKE 'distributor_%' THEN 'B2B'
//           ELSE 'B2C'
//         END as order_type
//       FROM orders o
//       LEFT JOIN ecom_user u ON o.user_id = u.id
//       LEFT JOIN users d ON o.distributor_id = d.id
//       WHERE o.payment_status = 'paid'
//       ${dateClause}
//       ORDER BY o.tax_amount DESC
//       LIMIT 20
//     `;
//     const topOrdersResult = await db.query(topOrdersQuery, [...dateParams]);

//     // 5. GST by Product
//     const byProductQuery = `
//       SELECT
//         oi.product_id,
//         oi.product_name,
//         COALESCE(SUM(oi.qty), 0)::int as total_qty_sold,
//         COALESCE(SUM(oi.total_item_price), 0)::numeric(12,2) as taxable_value,
//         COALESCE(SUM(oi.total_item_price * COALESCE(ts.tax_percentage, 0) / 100), 0)::numeric(12,2) as gst_amount
//       FROM orders o
//       JOIN order_items oi ON o.id = oi.order_id
//       LEFT JOIN products p ON oi.product_id = p.id
//       LEFT JOIN tax_settings ts ON p.tax_id = ts.id
//       WHERE o.payment_status = 'paid'
//       ${dateClause}
//       GROUP BY oi.product_id, oi.product_name
//       ORDER BY gst_amount DESC
//       LIMIT 20
//     `;
//     const byProductResult = await db.query(byProductQuery, [...dateParams]);

//     // 6. B2B vs B2C Breakdown
//     const b2bB2cQuery = `
//       SELECT
//         CASE
//           WHEN o.order_for LIKE 'distributor_%' THEN 'B2B'
//           ELSE 'B2C'
//         END as order_type,
//         COUNT(*)::int as total_orders,
//         COALESCE(SUM(o.sub_total), 0)::numeric(12,2) as taxable_value,
//         COALESCE(SUM(o.tax_amount), 0)::numeric(12,2) as gst_amount,
//         COALESCE(SUM(o.total_amount), 0)::numeric(12,2) as total_amount
//       FROM orders o
//       WHERE o.payment_status = 'paid'
//       ${dateClause}
//       GROUP BY
//         CASE
//           WHEN o.order_for LIKE 'distributor_%' THEN 'B2B'
//           ELSE 'B2C'
//         END
//       ORDER BY gst_amount DESC
//     `;
//     const b2bB2cResult = await db.query(b2bB2cQuery, [...dateParams]);

//     // 7. CGST / SGST / IGST Split
//     // Current schema stores flat tax_amount. Assuming intrastate (CGST+SGST) by default.
//     // When explicit interstate flag is added, IGST logic can be updated.
//     const gstSplitQuery = `
//       SELECT
//         COALESCE(SUM(o.tax_amount), 0)::numeric(12,2) as total_gst,
//         COALESCE(SUM(o.tax_amount / 2), 0)::numeric(12,2) as cgst,
//         COALESCE(SUM(o.tax_amount / 2), 0)::numeric(12,2) as sgst,
//         0::numeric(12,2) as igst
//       FROM orders o
//       WHERE o.payment_status = 'paid'
//       ${dateClause}
//     `;
//     const gstSplitResult = await db.query(gstSplitQuery, [...dateParams]);

//     return res.json({
//       success: true,
//       data: {
//         summary: summaryResult.rows[0],
//         tax_slabs: taxSlabResult.rows,
//         monthly_trend: monthlyTrendResult.rows,
//         top_orders: topOrdersResult.rows,
//         by_product: byProductResult.rows,
//         b2b_b2c_breakdown: b2bB2cResult.rows,
//         gst_split: gstSplitResult.rows[0],
//       },
//       message: "GST report fetched successfully",
//     });
//   } catch (error) {
//     console.error("Error fetching GST report:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

exports.getGSTReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    // Assume req.user controller mein auth middleware se aa raha hai
    const { id: userId, role } = req.user;

    const { clause: dateClause, params: dateParams } = buildDateRange(
      from,
      to,
      "o",
    );

    // --- MODIFICATION START: Role-based filtering logic ---
    let roleClause = "";
    let roleParams = [];

    // Agar user Super Admin nahi hai (yani Distributor hai), toh filter lagao
    if (role !== "super_admin" && role !== "Super Admin") {
      roleClause = ` AND o.distributor_id = $${dateParams.length + 1}`;
      roleParams = [userId];
    }

    // Sabhi queries ke liye combined params array
    const queryParams = [...dateParams, ...roleParams];
    // --- MODIFICATION END ---

    // 1. Overall GST Summary
    const summaryQuery = `
      SELECT
        COUNT(*)::int as total_orders,
        COALESCE(SUM(o.sub_total), 0)::numeric(12,2) as total_taxable_value,
        COALESCE(SUM(o.tax_amount), 0)::numeric(12,2) as total_gst_collected,
        COALESCE(SUM(o.total_amount), 0)::numeric(12,2) as total_amount,
        COALESCE(AVG(o.tax_amount), 0)::numeric(12,2) as avg_gst_per_order
      FROM orders o
      WHERE o.payment_status = 'paid'
      ${dateClause} ${roleClause}
    `;
    const summaryResult = await db.query(summaryQuery, queryParams);

    // 2. GST by Tax Slab
    const taxSlabQuery = `
      SELECT
        COALESCE(ts.tax_percentage, 0)::numeric(5,2) as tax_rate,
        COUNT(DISTINCT o.id)::int as total_orders,
        COALESCE(SUM(oi.total_item_price), 0)::numeric(12,2) as taxable_value,
        COALESCE(SUM(oi.total_item_price * COALESCE(ts.tax_percentage, 0) / 100), 0)::numeric(12,2) as gst_amount
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN tax_settings ts ON p.tax_id = ts.id
      WHERE o.payment_status = 'paid'
      ${dateClause} ${roleClause}
      GROUP BY ts.tax_percentage
      ORDER BY tax_rate DESC
    `;
    const taxSlabResult = await db.query(taxSlabQuery, queryParams);

    // 3. Monthly GST Trend
    const monthlyTrendQuery = `
      SELECT
        DATE_TRUNC('month', o.created_at) as month,
        COUNT(*)::int as orders,
        COALESCE(SUM(o.sub_total), 0)::numeric(12,2) as taxable_value,
        COALESCE(SUM(o.tax_amount), 0)::numeric(12,2) as gst_collected,
        COALESCE(SUM(o.total_amount), 0)::numeric(12,2) as total_amount
      FROM orders o
      WHERE o.payment_status = 'paid'
      ${dateClause} ${roleClause}
      GROUP BY DATE_TRUNC('month', o.created_at)
      ORDER BY month DESC
      LIMIT 12
    `;
    const monthlyTrendResult = await db.query(monthlyTrendQuery, queryParams);

    // 4. GST by Order (Top orders)
    const topOrdersQuery = `
      SELECT
        o.order_id,
        o.created_at,
        COALESCE(u.name, d.full_name, d.username) as customer_name,
        o.sub_total::numeric(12,2) as taxable_value,
        o.tax_amount::numeric(12,2) as gst_amount,
        o.total_amount::numeric(12,2) as total_amount,
        CASE
          WHEN o.order_for LIKE 'distributor_%' THEN 'B2B'
          ELSE 'B2C'
        END as order_type
      FROM orders o
      LEFT JOIN ecom_user u ON o.user_id = u.id
      LEFT JOIN users d ON o.distributor_id = d.id
      WHERE o.payment_status = 'paid'
      ${dateClause} ${roleClause}
      ORDER BY o.tax_amount DESC
      LIMIT 20
    `;
    const topOrdersResult = await db.query(topOrdersQuery, queryParams);

    // 5. GST by Product
    const byProductQuery = `
      SELECT
        oi.product_id,
        oi.product_name,
        COALESCE(SUM(oi.qty), 0)::int as total_qty_sold,
        COALESCE(SUM(oi.total_item_price), 0)::numeric(12,2) as taxable_value,
        COALESCE(SUM(oi.total_item_price * COALESCE(ts.tax_percentage, 0) / 100), 0)::numeric(12,2) as gst_amount
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN tax_settings ts ON p.tax_id = ts.id
      WHERE o.payment_status = 'paid'
      ${dateClause} ${roleClause}
      GROUP BY oi.product_id, oi.product_name
      ORDER BY gst_amount DESC
      LIMIT 20
    `;
    const byProductResult = await db.query(byProductQuery, queryParams);

    // 6. B2B vs B2C Breakdown
    const b2bB2cQuery = `
      SELECT
        CASE
          WHEN o.order_for LIKE 'distributor_%' THEN 'B2B'
          ELSE 'B2C'
        END as order_type,
        COUNT(*)::int as total_orders,
        COALESCE(SUM(o.sub_total), 0)::numeric(12,2) as taxable_value,
        COALESCE(SUM(o.tax_amount), 0)::numeric(12,2) as gst_amount,
        COALESCE(SUM(o.total_amount), 0)::numeric(12,2) as total_amount
      FROM orders o
      WHERE o.payment_status = 'paid'
      ${dateClause} ${roleClause}
      GROUP BY
        CASE
          WHEN o.order_for LIKE 'distributor_%' THEN 'B2B'
          ELSE 'B2C'
        END
      ORDER BY gst_amount DESC
    `;
    const b2bB2cResult = await db.query(b2bB2cQuery, queryParams);

    // 7. CGST / SGST / IGST Split
    const gstSplitQuery = `
      SELECT
        COALESCE(SUM(o.tax_amount), 0)::numeric(12,2) as total_gst,
        COALESCE(SUM(o.tax_amount / 2), 0)::numeric(12,2) as cgst,
        COALESCE(SUM(o.tax_amount / 2), 0)::numeric(12,2) as sgst,
        0::numeric(12,2) as igst
      FROM orders o
      WHERE o.payment_status = 'paid'
      ${dateClause} ${roleClause}
    `;
    const gstSplitResult = await db.query(gstSplitQuery, queryParams);

    return res.json({
      success: true,
      data: {
        summary: summaryResult.rows[0],
        tax_slabs: taxSlabResult.rows,
        monthly_trend: monthlyTrendResult.rows,
        top_orders: topOrdersResult.rows,
        by_product: byProductResult.rows,
        b2b_b2c_breakdown: b2bB2cResult.rows,
        gst_split: gstSplitResult.rows[0],
      },
      message: "GST report fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching GST report:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const ExcelJS = require("exceljs");

exports.exportGSTReportExcel = async (req, res) => {
  try {
    const { from, to } = req.query;
    const { clause: dateClause, params: dateParams } = buildDateRange(
      from,
      to,
      "o",
    );

    // 1. डेटा फेच करें (सिर्फ मुख्य डेटा ले रहे हैं एक्सेल के लिए)
    const reportQuery = `
      SELECT
        o.order_id,
        o.created_at,
        COALESCE(u.name, d.full_name, d.username) as customer_name,
        CASE WHEN o.order_for LIKE 'distributor_%' THEN 'B2B' ELSE 'B2C' END as type,
        o.sub_total::numeric(12,2) as taxable_value,
        o.tax_amount::numeric(12,2) as gst_amount,
        (o.tax_amount / 2)::numeric(12,2) as cgst,
        (o.tax_amount / 2)::numeric(12,2) as sgst,
        o.total_amount::numeric(12,2) as total
      FROM orders o
      LEFT JOIN ecom_user u ON o.user_id = u.id
      LEFT JOIN users d ON o.distributor_id = d.id
      WHERE o.payment_status = 'paid'
      ${dateClause}
      ORDER BY o.created_at DESC
    `;
    const result = await db.query(reportQuery, [...dateParams]);

    // 2. Excel Workbook और Worksheet बनाएं
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("GST Sales Report");

    // 3. Columns सेट करें
    worksheet.columns = [
      { header: "Order ID", key: "order_id", width: 20 },
      { header: "Date", key: "created_at", width: 15 },
      { header: "Customer", key: "customer_name", width: 25 },
      { header: "Type", key: "type", width: 10 },
      { header: "Taxable Value (₹)", key: "taxable_value", width: 15 },
      { header: "CGST (₹)", key: "cgst", width: 12 },
      { header: "SGST (₹)", key: "sgst", width: 12 },
      { header: "Total GST (₹)", key: "gst_amount", width: 15 },
      { header: "Grand Total (₹)", key: "total", width: 15 },
    ];

    // 4. Header को बोल्ड और कलर्ड बनाएं (Ganesh Tech Theme)
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "E91E63" }, // आपकी थीम का पिंक/मजेंटा कलर
      };
    });

    // 5. डेटा रोज़ जोड़ें
    result.rows.forEach((row) => {
      worksheet.addRow({
        ...row,
        created_at: new Date(row.created_at).toLocaleDateString(),
      });
    });

    // 6. Response Headers सेट करें
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=GST_Report.xlsx`,
    );

    // 7. फाइल भेजें
    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error("Excel Export Error:", error);
    res.status(500).json({ success: false, message: "Export failed" });
  }
};
