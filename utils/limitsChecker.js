const db = require('../config/db');

const DAILY_TRANSFER_LIMIT = 50000; // 50k total/day
const MAX_DAILY_TRANSFERS = 2;
const MIN_TRANSFER = 500;
const MAX_SINGLE_TRANSFER = 25000;

async function getTodayKey(userId) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return { user_id: userId, limit_date: today };
}

exports.checkTransferLimits = async (userId, amount) => {
  if (amount < MIN_TRANSFER || amount > MAX_SINGLE_TRANSFER) {
    throw new Error(`Transfer amount must be between ${MIN_TRANSFER} and ${MAX_SINGLE_TRANSFER}`);
  }

  const key = await getTodayKey(userId);
  const result = await db.query(
    `SELECT transfers_count, total_amount FROM daily_transaction_limits WHERE user_id = $1 AND limit_date = $2`,
    [key.user_id, key.limit_date]
  );
  
  const limits = result.rows[0] || { transfers_count: 0, total_amount: 0 };
  
  if (limits.transfers_count >= MAX_DAILY_TRANSFERS) {
    throw new Error(`Daily transfer limit reached (${MAX_DAILY_TRANSFERS}/day)`);
  }
  
  if (limits.total_amount + amount > DAILY_TRANSFER_LIMIT) {
    throw new Error(`Daily total limit exceeded. Current: ${limits.total_amount}/${DAILY_TRANSFER_LIMIT}`);
  }

  return true;
};

exports.updateTransferLimits = async (userId, amount) => {
  const key = await getTodayKey(userId);
  await db.query(
    `INSERT INTO daily_transaction_limits (user_id, limit_date, transfers_count, total_amount) 
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (user_id, limit_date) 
     DO UPDATE SET 
       transfers_count = daily_transaction_limits.transfers_count + 1,
       total_amount = daily_transaction_limits.total_amount + $3,
       updated_at = CURRENT_TIMESTAMP`,
    [key.user_id, key.limit_date, amount]
  );
};

exports.resetOldLimits = async (userId) => {
  // Cron or manual: delete old dates
  await db.query(
    `DELETE FROM daily_transaction_limits WHERE limit_date < CURRENT_DATE`
  );
};
