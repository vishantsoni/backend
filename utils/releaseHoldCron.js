const cron = require('node-cron');
const db = require('../config/db');

// Daily cron to release 30-day hold commissions to total_balance
async function releaseHeldCommissions() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const pendingWallets = await db.query(`
    UPDATE wallets 
    SET 
      total_amount = total_amount + pending_amount,
      pending_amount = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE pending_amount > 0
    RETURNING user_id, pending_amount
  `);
  
  if (pendingWallets.rows.length > 0) {
    console.log(`Released hold for ${pendingWallets.rows.length} users:`, pendingWallets.rows);
    // Optional: Log as credit txn with category 'commission_release'
  }
}

// Run daily at midnight
cron.schedule('0 0 * * *', releaseHeldCommissions);

console.log('Hold release cron scheduled daily at midnight');
