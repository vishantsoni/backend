const pool = require("../../../config/db");

async function getWalletBalance({ authContext }) {
  const { distributorId } = authContext;

  const res = await pool.query(
    `SELECT
      total_amount,
      pending_amount,
      left_count,
      right_count,
      paid_pairs,
      company_fund,
      updated_at
     FROM public.wallets
     WHERE user_id = $1
     LIMIT 1`,
    [distributorId],
  );

  return res.rows[0] || null;
}

async function getDownlineCount({ authContext }) {
  const { distributorId } = authContext;

  const res = await pool.query(
    `WITH me AS (
       SELECT binary_path
       FROM public.users
       WHERE id = $1
     )
     SELECT (COUNT(u.id) - 1) AS downline_count
     FROM public.users u, me
     WHERE u.binary_path <@ me.binary_path`,
    [distributorId],
  );

  return { downlineCount: Number(res.rows[0]?.downline_count || 0) };
}

async function getLatestCommissions({ authContext, limit = 10 }) {
  const { distributorId } = authContext;

  const res = await pool.query(
    `SELECT
      t.id,
      t.amount,
      t.type,
      t.category,
      t.source_user_id,
      t.order_id,
      t.remarks,
      t.status,
      t.created_at
     FROM public.transactions t
     WHERE t.user_id = $1
       AND t.category IN ('commission','ref_bonus','bonus')
     ORDER BY t.created_at DESC
     LIMIT COALESCE($2::int, 10)`,
    [distributorId, limit],
  );

  return res.rows;
}

const mlmTools = {
  getWalletBalance,
  getDownlineCount,
  getLatestCommissions,
};

module.exports = { mlmTools };
