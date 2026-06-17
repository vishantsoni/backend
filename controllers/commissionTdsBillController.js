const db = require("../config/db");
const {
  getOrCreateCommissionTdsBillPdf,
} = require("../utils/commissionTdsBillService");

function parseOptionalBoolean(val) {
  return String(val ?? "false").toLowerCase() === "true";
}

function getLastMonthRangeUTC() {
  // Returns [from, toExclusive]
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const prevMonth = month - 1;
  const prevYear = prevMonth < 0 ? year - 1 : year;
  const prevMonthAdj = prevMonth < 0 ? 11 : prevMonth;

  const from = new Date(Date.UTC(prevYear, prevMonthAdj, 1, 0, 0, 0));
  const toExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { from, toExclusive };
}

async function fetchCommission({ userId, from, toExclusive }) {
  const summaryQuery = `
    SELECT
      COUNT(*)::int as total_transactions,
      COALESCE(SUM(amount), 0)::numeric(18,2) as total_amount
    FROM transactions t
    WHERE t.user_id = $1
      AND t.type = 'credit'
      AND t.category = 'commission'
      AND t.created_at >= $2
      AND t.created_at < $3
  `;

  const listQuery = `
    SELECT
      t.id,
      t.created_at,
      t.user_id,
      t.amount,
      t.category,
      t.type,
      t.remarks
    FROM transactions t
    WHERE t.user_id = $1
      AND t.type = 'credit'
      AND t.category = 'commission'
      AND t.created_at >= $2
      AND t.created_at < $3
    ORDER BY t.created_at DESC
    LIMIT 50
  `;

  const [summaryResult, listResult] = await Promise.all([
    db.query(summaryQuery, [
      userId,
      from.toISOString(),
      toExclusive.toISOString(),
    ]),
    db.query(listQuery, [
      userId,
      from.toISOString(),
      toExclusive.toISOString(),
    ]),
  ]);

  return {
    summary: summaryResult.rows[0] || {
      total_transactions: 0,
      total_amount: 0,
    },
    transactions: listResult.rows || [],
  };
}

async function fetchTds({ userId, from, toExclusive }) {
  const summaryQuery = `
    SELECT
      COUNT(*)::int as total_transactions,
      COALESCE(SUM(amount), 0)::numeric(18,2) as total_amount
    FROM transactions t
    WHERE t.user_id = $1
      AND t.type = 'debit'
      AND t.category = 'withdraw'
      AND t.remarks ILIKE '%TDS Deduction%'
      AND t.created_at >= $2
      AND t.created_at < $3
  `;

  const listQuery = `
    SELECT
      t.id,
      t.created_at,
      t.user_id,
      t.amount,
      t.category,
      t.type,
      t.remarks
    FROM transactions t
    WHERE t.user_id = $1
      AND t.type = 'debit'
      AND t.category = 'withdraw'
      AND t.remarks ILIKE '%TDS Deduction%'
      AND t.created_at >= $2
      AND t.created_at < $3
    ORDER BY t.created_at DESC
    LIMIT 50
  `;

  const [summaryResult, listResult] = await Promise.all([
    db.query(summaryQuery, [
      userId,
      from.toISOString(),
      toExclusive.toISOString(),
    ]),
    db.query(listQuery, [
      userId,
      from.toISOString(),
      toExclusive.toISOString(),
    ]),
  ]);

  return {
    summary: summaryResult.rows[0] || {
      total_transactions: 0,
      total_amount: 0,
    },
    transactions: listResult.rows || [],
  };
}

exports.generateCommissionTdsBillPdf = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { cycleKey, force } = req.body || req.query || {};
    const forceBool = parseOptionalBoolean(force);

    let fromDate;
    let toExclusive;

    // cycleKey format: YYYY-MM (example: 2026-06)
    if (cycleKey) {
      const m = String(cycleKey).match(/^\d{4}-\d{2}$/);
      if (!m) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid cycleKey format. Expected 'YYYY-MM' (e.g., 2026-06).",
        });
      }

      const [yStr, moStr] = String(cycleKey).split("-");
      const year = Number(yStr);
      const monthIndex = Number(moStr) - 1;

      if (
        !Number.isFinite(year) ||
        !Number.isFinite(monthIndex) ||
        monthIndex < 0 ||
        monthIndex > 11
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid cycleKey month.",
        });
      }

      fromDate = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
      toExclusive = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));
    } else {
      const range = getLastMonthRangeUTC();
      fromDate = range.from;
      toExclusive = range.toExclusive;
    }

    const finalCycleKey = cycleKey
      ? String(cycleKey)
      : `${fromDate.getUTCFullYear()}-${String(
          fromDate.getUTCMonth() + 1,
        ).padStart(2, "0")}`;

    const cycleKeyForStorage = finalCycleKey;

    const [commission, tds] = await Promise.all([
      fetchCommission({ userId, from: fromDate, toExclusive }),
      fetchTds({ userId, from: fromDate, toExclusive }),
    ]);

    const userRes = await db.query(
      "SELECT full_name, phone, email, address, city, state, pin FROM users WHERE id = $1",
      [userId],
    );
    const userData = userRes.rows[0] || {};

    const result = await getOrCreateCommissionTdsBillPdf({
      userId,
      cycleKey: cycleKeyForStorage,
      from: fromDate.toISOString().slice(0, 10),
      to: toExclusive.toISOString().slice(0, 10),
      commissionSummary: commission.summary,
      tdsSummary: tds.summary,
      commissionTransactions: commission.transactions,
      tdsTransactions: tds.transactions,
      cusInfo: {
        name: userData.full_name || "",
        phone: userData.phone || "",
        email: userData.email || "",
        address: userData.address || "",
        city: userData.city || "",
        state: userData.state || "",
        pinCode: userData.pin || "",
      },
      force: forceBool,
    });

    return res.json({
      success: true,
      statusCode: 200,
      url: result.url,
      created: result.created,
      data: {
        userId,
        commission: commission.summary,
        tds: tds.summary,
        from: fromDate,
        toExclusive,
      },
    });
  } catch (err) {
    console.error("Commission/TDS bill pdf generation error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
