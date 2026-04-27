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
