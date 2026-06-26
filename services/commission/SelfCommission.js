const SelfCommission = async (client, userId, body) => {
  try {
    const { amount, razorpay_order_id, order_id } = body;

    // 1. SELF COMMISSION (CASHBACK) - Level 0 Logic
    const commConfigOWN = await client.query(
      `SELECT commission_percentage FROM level_commissions WHERE level_no = 0`,
    );
    const ownRate = commConfigOWN.rows[0]?.commission_percentage || 0;
    const ownCommission = amount * (ownRate / 100);

    if (ownCommission > 0) {
      await client.query(
        `INSERT INTO transactions (user_id, amount, type, category, source_user_id, status, remarks)
         VALUES ($1, $2, 'credit', 'commission', $1, 'pending', $3)`,
        [userId, ownCommission, "Self purchase cashback | " + order_id],
      );
      await client.query(
        `UPDATE wallets SET pending_amount = pending_amount + $1 WHERE user_id = $2`,
        [ownCommission, userId],
      );

      //Account activation

      await client.query(`UPDATE users SET is_active = true WHERE id = $1`, [
        userId,
      ]);
    }
    return { status: true };
  } catch (err) {
    console.log("Self Commission Error log - ", err);
    return { status: false };
  }
};

module.exports = SelfCommission;
