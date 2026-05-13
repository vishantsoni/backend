const db = require("../config/db");
const bcrypt = require("bcrypt");
const otpService = require("../utils/otpService");
const limitsChecker = require("../utils/limitsChecker");

const HOLD_DAYS = 30;

// Verify transaction PIN
exports.verifyPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const userId = req.user.id;

    if (!pin || pin.length < 4 || pin.length > 6) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid PIN length (4-6 digits)" });
    }

    // Check user pin
    const user = await db.query(
      "SELECT transaction_pin_hash FROM users WHERE id = $1",
      [userId],
    );
    if (!user.rows[0]?.transaction_pin_hash) {
      return res.status(400).json({
        success: false,
        error: "Transaction PIN not set. Set PIN first.",
      });
    }

    const isValid = await bcrypt.compare(
      pin,
      user.rows[0].transaction_pin_hash,
    );
    if (!isValid) {
      return res.status(400).json({ success: false, error: "Invalid PIN" });
    }

    res.json({ success: true, message: "PIN verified" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// Send OTP for transaction
exports.sendOTP = async (req, res) => {
  try {
    const userId = req.user.id;
    const { purpose = "transfer" } = req.body;

    const result = await otpService.sendOTP(userId, purpose);
    res.json({
      success: true,
      message: `OTP sent to ${result.sentTo}`,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { otp, purpose = "transfer" } = req.body;
    const userId = req.user.id;

    const isValid = await otpService.verifyOTP(userId, otp, purpose);
    if (!isValid) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid or expired OTP" });
    }

    res.json({ success: true, message: "OTP verified" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

// Transfer to another user (MLM internal transfer)
exports.transferToUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { toUserId, amount, remarks } = req.body;

    // Pre-checks
    await limitsChecker.checkTransferLimits(userId, amount);

    // KYC check (assume middleware or here)
    const kyc = await db.query("SELECT kyc_status FROM users WHERE id = $1", [
      userId,
    ]);
    if (!kyc.rows[0]?.kyc_status) {
      return res
        .status(400)
        .json({ success: false, error: "KYC required for transactions" });
    }

    // Balance check (use available_balance)
    const balanceRes = await db.query(
      `
      SELECT COALESCE(total_amount, 0) + COALESCE(pending_amount, 0) as available FROM wallets WHERE user_id = $1
    `,
      [userId],
    );
    const available = parseFloat(balanceRes.rows[0]?.available || 0);
    if (available < amount) {
      return res
        .status(400)
        .json({ success: false, error: "Insufficient balance" });
    }

    // Use pending for commission-like holds? For transfer, deduct from total
    // Assume simple: deduct total, credit receiver total (no hold for P2P, hold on commission)
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Deduct sender
      await client.query(
        "UPDATE wallets SET total_amount = total_amount - $1 WHERE user_id = $2",
        [amount, userId],
      );

      // Credit receiver
      await client.query(
        `
        INSERT INTO wallets (user_id, total_amount) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET 
          total_amount = wallets.total_amount + $2,
          updated_at = CURRENT_TIMESTAMP
      `,
        [toUserId, amount],
      );

      // Log txns
      const txnIdSender = await client.query(
        "INSERT INTO transactions (user_id, amount, type, category, source_user_id, remarks, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        [
          userId,
          amount,
          "debit",
          "transfer",
          toUserId,
          remarks || "P2P Transfer",
          "completed",
        ],
      );

      await client.query(
        "INSERT INTO transactions (user_id, amount, type, category, source_user_id, remarks, status) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          toUserId,
          amount,
          "credit",
          "transfer",
          userId,
          remarks || "P2P Transfer",
          "completed",
        ],
      );

      // Update limits
      await limitsChecker.updateTransferLimits(userId, amount);

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Transfer successful",
        txnId: txnIdSender.rows[0].id,
        newBalance: available - amount,
      });
    } catch (txnErr) {
      await client.query("ROLLBACK");
      throw txnErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
};

// Withdraw to bank (similar, but pending_amount move to total first? Add status 'pending_approval')
exports.withdraw = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, remarks } = req.body;

    // Same checks as transfer + bank details exist?
    await limitsChecker.checkTransferLimits(userId, amount);

    const user = await db.query(
      "SELECT bank_name, account_no, ifsc_code FROM users WHERE id = $1",
      [userId],
    );
    if (!user.rows[0]?.account_no) {
      return res
        .status(400)
        .json({ success: false, error: "Bank details required" });
    }

    // Balance check (only total_amount for withdraw)
    const balanceRes = await db.query(
      "SELECT COALESCE(total_amount, 0) as total FROM wallets WHERE user_id = $1",
      [userId],
    );
    const total = parseFloat(balanceRes.rows[0]?.total || 0);
    if (total < amount) {
      return res
        .status(400)
        .json({ success: false, error: "Insufficient withdrawable balance" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Deduct immediately; admin approval just finalizes.
      await client.query(
        "UPDATE wallets SET total_amount = total_amount - $1 WHERE user_id = $2",
        [amount, userId],
      );

      const txnId = await client.query(
        `INSERT INTO transactions (user_id, amount, type, category, remarks, status) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          userId,
          amount,
          "debit",
          "withdraw",
          remarks || "Bank Withdrawal",
          "pending_approval",
        ],
      );

      await limitsChecker.updateTransferLimits(userId, amount);

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Withdrawal requested (pending admin approval)",
        txnId: txnId.rows[0].id,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
};

// =============================
// Super Admin: Withdraw workflow
// =============================
// Uses `transactions` table as withdraw request record.
// - submit: status = pending_approval (funds already deducted)
// - approve: status = approved (ready for payout cron later)
// - reject: status = rejected AND wallet balance is credited back

exports.listWithdrawRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const adminUserId = req.user.id;

    const allowedStatuses = [
      "pending_approval",
      "approved",
      "rejected",
      "completed",
      "paid",
    ];
    const finalStatus = status ? String(status) : null;
    if (finalStatus && !allowedStatuses.includes(finalStatus)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status filter",
      });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Pending list by default
    const statusesToShow = finalStatus
      ? [finalStatus]
      : ["pending_approval", "approved"];

    const query = `
      SELECT
        t.id,
        t.user_id,
        u.username,
        u.full_name,
        t.amount,
        t.remarks,
        t.status,
        t.created_at
      FROM transactions t
      JOIN users u ON u.id = t.user_id
      WHERE t.category = 'withdraw'
        AND t.type = 'debit'
        AND t.status = ANY($1)
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM transactions t
      WHERE t.category = 'withdraw'
        AND t.type = 'debit'
        AND t.status = ANY($1)
    `;

    const [txns, countResult] = await Promise.all([
      db.query(query, [statusesToShow, parseInt(limit), offset]),
      db.query(countQuery, [statusesToShow]),
    ]);

    res.json({
      success: true,
      data: txns.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.rows[0]?.total || 0,
        pages:
          Math.ceil((countResult.rows[0]?.total || 0) / parseInt(limit)) || 1,
      },
      adminUserId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};

exports.approveWithdrawRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminRemark } = req.body;

    const txn = await db.query(
      `SELECT * FROM transactions WHERE id = $1 AND category = 'withdraw' AND type = 'debit'`,
      [id],
    );

    if (!txn.rows[0]) {
      return res
        .status(404)
        .json({ success: false, error: "Withdraw request not found" });
    }

    if (txn.rows[0].status !== "pending_approval") {
      return res.status(400).json({
        success: false,
        error: `Withdraw request not in pending_approval state (current: ${txn.rows[0].status})`,
      });
    }

    await db.query(
      `UPDATE transactions SET status = $1, remarks = $2 WHERE id = $3`,
      [
        "approved",
        adminRemark
          ? `${txn.rows[0].remarks || ""} | Admin Remark: ${adminRemark}`
          : txn.rows[0].remarks,
        id,
      ],
    );

    res.json({
      success: true,
      message: "Withdraw request approved",
      txnId: parseInt(id),
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.rejectWithdrawRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminRemark } = req.body;

    const txn = await db.query(
      `SELECT * FROM transactions WHERE id = $1 AND category = 'withdraw' AND type = 'debit'`,
      [id],
    );

    if (!txn.rows[0]) {
      return res
        .status(404)
        .json({ success: false, error: "Withdraw request not found" });
    }

    if (txn.rows[0].status !== "pending_approval") {
      return res.status(400).json({
        success: false,
        error: `Withdraw request not in pending_approval state (current: ${txn.rows[0].status})`,
      });
    }

    const { user_id: withdrawUserId, amount } = txn.rows[0];

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Reverse wallet deduction since withdraw() already deducted on submit.
      await client.query(
        "UPDATE wallets SET total_amount = total_amount + $1 WHERE user_id = $2",
        [amount, withdrawUserId],
      );

      await client.query(
        `UPDATE transactions SET status = $1, remarks = $2 WHERE id = $3`,
        [
          "rejected",
          adminRemark
            ? `${txn.rows[0].remarks || ""} | Admin Remark: ${adminRemark}`
            : txn.rows[0].remarks,
          id,
        ],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message: "Withdraw request rejected",
      txnId: parseInt(id),
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
};

// =============================
// Super Admin: List all transactions
// GET /api/transactions?page=1&limit=20&status=&type=&category=&userId=
// =============================
exports.listAllTransactionsForSuperAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type, category, userId } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = [];
    const params = [];
    let pIndex = 1;

    if (status) {
      where.push(`t.status = $${pIndex}`);
      params.push(String(status));
      pIndex++;
    }
    if (type) {
      where.push(`t.type = $${pIndex}`);
      params.push(String(type));
      pIndex++;
    }
    if (category) {
      where.push(`t.category = $${pIndex}`);
      params.push(String(category));
      pIndex++;
    }
    if (userId) {
      where.push(`t.user_id = $${pIndex}`);
      params.push(parseInt(userId));
      pIndex++;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const query = `
      SELECT
        t.id,
        t.user_id,
        u.username,
        u.full_name,
        t.amount,
        t.type,
        t.category,
        t.source_user_id,
        t.remarks,
        t.status,
        t.created_at,
         COALESCE(
            SUM(
              CASE
                WHEN (s.setting_value->>'uv_type') = 'percentage'
                  THEN (t.amount * (s.setting_value->>'uv_value')::numeric) / 100
                ELSE (t.amount / NULLIF((s.setting_value->>'uv_value')::numeric, 0))
              END
            ) ,
            0
          )::numeric(15,2) AS amount
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      CROSS JOIN app_settings s
      WHERE s.setting_key = 'point_system'
        ${whereSql ? whereSql.replace("WHERE ", "AND ") : ""}
      GROUP BY 
        t.id,
        u.username,
        u.full_name,
        s.setting_value
      ORDER BY t.created_at DESC
      LIMIT $${pIndex} OFFSET $${pIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM transactions t
      ${whereSql}
    `;

    const [txns, countResult] = await Promise.all([
      db.query(query, [...params, parseInt(limit), offset]),
      db.query(countQuery, params),
    ]);

    // NEW: When a user filter is applied, also return wallet + transaction statistics.
    if (userId) {
      const userIdInt = parseInt(userId);

      const walletQuery = `
        SELECT
          COALESCE(w.total_amount, 0)::numeric(15,2) AS total_amount,
          COALESCE(w.pending_amount, 0)::numeric(15,2) AS pending_amount,
          (COALESCE(w.total_amount, 0) + COALESCE(w.pending_amount, 0))::numeric(15,2) AS available_balance,

          -- UV conversion for wallet amounts (same logic as transactions)
          COALESCE(
            CASE
              WHEN (s.setting_value->>'uv_type') = 'percentage'
                THEN (COALESCE(w.total_amount, 0) * (s.setting_value->>'uv_value')::numeric) / 100
              ELSE (COALESCE(w.total_amount, 0) / NULLIF((s.setting_value->>'uv_value')::numeric, 0))
            END,
          0
          )::numeric(15,2) AS total_amount_uv,

          COALESCE(
            CASE
              WHEN (s.setting_value->>'uv_type') = 'percentage'
                THEN (COALESCE(w.pending_amount, 0) * (s.setting_value->>'uv_value')::numeric) / 100
              ELSE (COALESCE(w.pending_amount, 0) / NULLIF((s.setting_value->>'uv_value')::numeric, 0))
            END,
          0
          )::numeric(15,2) AS pending_amount_uv,

          COALESCE(
            CASE
              WHEN (s.setting_value->>'uv_type') = 'percentage'
                THEN ((COALESCE(w.total_amount, 0) + COALESCE(w.pending_amount, 0)) * (s.setting_value->>'uv_value')::numeric) / 100
              ELSE ((COALESCE(w.total_amount, 0) + COALESCE(w.pending_amount, 0)) / NULLIF((s.setting_value->>'uv_value')::numeric, 0))
            END,
          0
          )::numeric(15,2) AS available_balance_uv,

          COALESCE(
            CASE
              WHEN (s.setting_value->>'uv_type') = 'percentage'
                THEN ((COALESCE(w.company_fund, 0) + COALESCE(w.company_fund, 0)) * (s.setting_value->>'uv_value')::numeric) / 100
              ELSE ((COALESCE(w.company_fund, 0) + COALESCE(w.company_fund, 0)) / NULLIF((s.setting_value->>'uv_value')::numeric, 0))
            END,
          0
          )::numeric(15,2) AS company_fund_uv

        FROM wallets w
        CROSS JOIN app_settings s
        WHERE s.setting_key = 'point_system'
          AND w.user_id = $1
      `;

      // Transaction totals are computed only for the same filtered set.
      // If status/type/category filters are not provided, it naturally returns totals for all those transactions.
      const transactionTotalsQuery = `
        SELECT
          COUNT(*)::int AS total_transactions,

          -- Raw amount totals
          COALESCE(SUM(amount) FILTER (WHERE type = 'credit'), 0)::numeric(15,2) AS total_credits,
          COALESCE(SUM(amount) FILTER (WHERE type = 'debit'), 0)::numeric(15,2) AS total_debits,
          COALESCE(SUM(amount) FILTER (WHERE type = 'credit'), 0)
            - COALESCE(SUM(amount) FILTER (WHERE type = 'debit'), 0) AS net_amount,

          -- UV totals (depends on uv_type)
          COALESCE(
            SUM(
              CASE
                WHEN (s.setting_value->>'uv_type') = 'percentage'
                  THEN (amount * (s.setting_value->>'uv_value')::numeric) / 100
                ELSE (amount / NULLIF((s.setting_value->>'uv_value')::numeric, 0))
              END
            ) FILTER (WHERE type = 'credit'),
            0
          )::numeric(15,2) AS total_credits_uv,

          COALESCE(
            SUM(
              CASE
                WHEN (s.setting_value->>'uv_type') = 'percentage'
                  THEN (amount * (s.setting_value->>'uv_value')::numeric) / 100
                ELSE (amount / NULLIF((s.setting_value->>'uv_value')::numeric, 0))
              END
            ) FILTER (WHERE type = 'debit'),
            0
          )::numeric(15,2) AS total_debits_uv,

          COALESCE(
            SUM(
              CASE
                WHEN (s.setting_value->>'uv_type') = 'percentage'
                  THEN (amount * (s.setting_value->>'uv_value')::numeric) / 100
                ELSE (amount / NULLIF((s.setting_value->>'uv_value')::numeric, 0))
              END
            ) FILTER (WHERE type = 'credit'),
            0
          )::numeric(15,2)
          - COALESCE(
              SUM(
                CASE
                  WHEN (s.setting_value->>'uv_type') = 'percentage'
                    THEN (amount * (s.setting_value->>'uv_value')::numeric) / 100
                  ELSE (amount / NULLIF((s.setting_value->>'uv_value')::numeric, 0))
                END
              ) FILTER (WHERE type = 'debit'),
              0
            )::numeric(15,2) AS net_amount_uv
        FROM transactions t
        CROSS JOIN app_settings s
        WHERE s.setting_key = 'point_system'
        ${whereSql ? whereSql.replace("WHERE ", "AND ") : ""}
      `;

      const [walletRes, txnTotalsRes] = await Promise.all([
        db.query(walletQuery, [userIdInt]),
        db.query(transactionTotalsQuery, params),
      ]);

      const wallet = walletRes.rows[0] || {
        total_amount: 0,
        pending_amount: 0,
        available_balance: 0,
        total_amount_uv: 0,
        pending_amount_uv: 0,
        available_balance_uv: 0,
      };

      const txnTotals = txnTotalsRes.rows[0] || {
        total_transactions: 0,
        total_credits: 0,
        total_debits: 0,
        net_amount: 0,
        total_credits_uv: 0,
        total_debits_uv: 0,
        net_amount_uv: 0,
      };

      return res.json({
        success: true,
        data: txns.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.rows[0]?.total || 0,
          pages:
            Math.ceil((countResult.rows[0]?.total || 0) / parseInt(limit)) || 1,
        },
        wallet,
        transactionStats: txnTotals,
      });
    }

    res.json({
      success: true,
      data: txns.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.rows[0]?.total || 0,
        pages:
          Math.ceil((countResult.rows[0]?.total || 0) / parseInt(limit)) || 1,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Server error" });
  }
};
