const db = require("../config/db");

// Helper to safely run a query and return default on error
const safeQuery = async (query, params = [], defaultValue = null) => {
  try {
    const result = await db.query(query, params);
    return { success: true, data: result.rows };
  } catch (error) {
    console.error("Dashboard query error:", error.message);
    return { success: false, error: error.message, data: defaultValue };
  }
};

// @desc    Get Admin Dashboard Data
// @route   GET /api/dashboard
exports.getDashboardData = async (req, res) => {
  try {
    // ─── 1. USER STATISTICS ───
    const userStats = await safeQuery(
      `
      SELECT
        COUNT(*)::int as total_users,
        COUNT(*) FILTER (WHERE is_active = true)::int as active_users,
        COUNT(*) FILTER (WHERE is_active = false)::int as inactive_users,
        COUNT(*) FILTER (WHERE kyc_status = true)::int as kyc_approved_users,
        COUNT(*) FILTER (WHERE kyc_status = false)::int as kyc_pending_users,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int as new_users_today,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE))::int as new_users_this_week,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE))::int as new_users_this_month
      FROM users
      `,
      [],
      [{}],
    );

    // ─── 2. ORDER STATISTICS ───
    const orderStats = await safeQuery(
      `
      SELECT
        COUNT(*)::int as total_orders,
        COALESCE(SUM(total_amount), 0)::numeric(12,2) as total_revenue,
        COALESCE(AVG(total_amount), 0)::numeric(12,2) as avg_order_value,
        COUNT(*) FILTER (WHERE order_status = 'pending')::int as pending_orders,
        COUNT(*) FILTER (WHERE order_status = 'delivered')::int as delivered_orders,
        COUNT(*) FILTER (WHERE order_status = 'cancelled')::int as cancelled_orders,
        COUNT(*) FILTER (WHERE payment_status = 'paid')::int as paid_orders,
        COUNT(*) FILTER (WHERE payment_status = 'unpaid')::int as unpaid_orders
      FROM orders
      `,
      [],
      [{}],
    );

    // ─── 3. PACKAGE PURCHASE STATISTICS ───
    const packageStats = await safeQuery(
      `
      SELECT
        COUNT(*)::int as total_package_purchases,
        COALESCE(SUM(amount), 0)::numeric(12,2) as total_package_revenue
      FROM user_packages
      WHERE status = 'activated'
      `,
      [],
      [{}],
    );

    // ─── 4. KYC REQUEST STATISTICS ───
    const kycStats = await safeQuery(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int as pending_kyc,
        COUNT(*) FILTER (WHERE status = 'under_review')::int as under_review_kyc,
        COUNT(*) FILTER (WHERE status = 'approved')::int as approved_kyc,
        COUNT(*) FILTER (WHERE status = 'rejected')::int as rejected_kyc
      FROM kyc_requests
      `,
      [],
      [{}],
    );

    // ─── 5. WALLET & TRANSACTION STATISTICS ───
    const walletStats = await safeQuery(
      `
      SELECT
        COALESCE(SUM(total_amount), 0)::numeric(15,2) as total_wallet_balance,
        COALESCE(SUM(pending_amount), 0)::numeric(15,2) as total_pending_amount
      FROM wallets
      `,
      [],
      [{}],
    );

    const transactionStats = await safeQuery(
      `
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE category = 'commission' AND type = 'credit'), 0)::numeric(15,2) as total_commissions,
        COALESCE(SUM(amount) FILTER (WHERE category = 'withdraw' AND type = 'debit'), 0)::numeric(15,2) as total_withdrawals,
        COALESCE(SUM(amount) FILTER (WHERE category = 'purchase' AND type = 'debit'), 0)::numeric(15,2) as total_purchases,
        COALESCE(SUM(amount) FILTER (WHERE category = 'ref_bonus' AND type = 'credit'), 0)::numeric(15,2) as total_ref_bonuses
      FROM transactions
      `,
      [],
      [{}],
    );

    // ─── 6. PRODUCT STATISTICS ───
    const productStats = await safeQuery(
      `
      SELECT
        (SELECT COUNT(*)::int FROM products) as total_products,
        (SELECT COUNT(*)::int FROM pro_variants) as total_variants,
        (SELECT COUNT(*)::int FROM pro_variants WHERE stock <= 10) as low_stock_variants
      `,
      [],
      [{}],
    );

    // ─── 7. RECENT ACTIVITY ───
    const recentOrders = await safeQuery(
      `
      SELECT
        o.id,
        o.order_id,
        o.total_amount,
        o.order_status,
        o.payment_status,
        o.created_at,
        COALESCE(eu.name, d.full_name, d.username) as customer_name,
        COALESCE(eu.phone, d.phone) as customer_phone
      FROM orders o
      LEFT JOIN ecom_user eu ON o.user_id = eu.id
      LEFT JOIN users d ON o.distributor_id = d.id
      ORDER BY o.created_at DESC
      LIMIT 5
      `,
      [],
      [],
    );

    const recentUsers = await safeQuery(
      `
      SELECT
        id,
        full_name,
        username,
        phone,
        email,
        referral_code,
        is_active,
        kyc_status,
        created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
      `,
      [],
      [],
    );

    const recentTransactions = await safeQuery(
      `
      SELECT
        t.id,
        t.amount,
        t.type,
        t.category,
        t.status,
        t.created_at,
        u.full_name as user_name,
        u.phone as user_phone
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
      LIMIT 5
      `,
      [],
      [],
    );

    // ─── 8. CHART DATA ───
    const dailySales = await safeQuery(
      `
      SELECT
        DATE(created_at) as date,
        COUNT(*)::int as orders,
        COALESCE(SUM(total_amount), 0)::numeric(12,2) as revenue
      FROM orders
      WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
      `,
      [],
      [],
    );

    const dailyUsers = await safeQuery(
      `
      SELECT
        DATE(created_at) as date,
        COUNT(*)::int as new_users
      FROM users
      WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
      `,
      [],
      [],
    );

    const dailyPackages = await safeQuery(
      `
      SELECT
        DATE(activated_at) as date,
        COUNT(*)::int as purchases,
        COALESCE(SUM(amount), 0)::numeric(12,2) as revenue
      FROM user_packages
      WHERE status = 'activated'
        AND activated_at >= CURRENT_DATE - INTERVAL '6 days'
      GROUP BY DATE(activated_at)
      ORDER BY date ASC
      `,
      [],
      [],
    );

    // ─── 9. NOTIFICATION COUNT ───
    const notificationCount = await safeQuery(
      `SELECT COUNT(*)::int as total_notifications FROM notifications`,
      [],
      [{}],
    );

    // ─── COMBINE ALL DATA ───
    return res.json({
      success: true,
      data: {
        users: userStats.data?.[0] || {},
        orders: orderStats.data?.[0] || {},
        packages: packageStats.data?.[0] || {},
        kyc: kycStats.data?.[0] || {},
        wallet: walletStats.data?.[0] || {},
        transactions: transactionStats.data?.[0] || {},
        products: productStats.data?.[0] || {},
        notifications: notificationCount.data?.[0] || {},
        recent: {
          orders: recentOrders.data || [],
          users: recentUsers.data || [],
          transactions: recentTransactions.data || [],
        },
        charts: {
          daily_sales: dailySales.data || [],
          daily_registrations: dailyUsers.data || [],
          daily_packages: dailyPackages.data || [],
        },
      },
      errors: [
        !userStats.success && { section: "users", error: userStats.error },
        !orderStats.success && { section: "orders", error: orderStats.error },
        !packageStats.success && {
          section: "packages",
          error: packageStats.error,
        },
        !kycStats.success && { section: "kyc", error: kycStats.error },
        !walletStats.success && { section: "wallet", error: walletStats.error },
        !transactionStats.success && {
          section: "transactions",
          error: transactionStats.error,
        },
        !productStats.success && {
          section: "products",
          error: productStats.error,
        },
        !recentOrders.success && {
          section: "recent_orders",
          error: recentOrders.error,
        },
        !recentUsers.success && {
          section: "recent_users",
          error: recentUsers.error,
        },
        !recentTransactions.success && {
          section: "recent_transactions",
          error: recentTransactions.error,
        },
        !dailySales.success && {
          section: "daily_sales",
          error: dailySales.error,
        },
        !dailyUsers.success && {
          section: "daily_users",
          error: dailyUsers.error,
        },
        !dailyPackages.success && {
          section: "daily_packages",
          error: dailyPackages.error,
        },
        !notificationCount.success && {
          section: "notifications",
          error: notificationCount.error,
        },
      ].filter(Boolean),
      message: "Dashboard data fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
