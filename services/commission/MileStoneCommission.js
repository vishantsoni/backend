const MilestonDistribution = async (
  client,
  userId,
  currentPaidPairs,
  newPairs,
  totalMatchingAmount,
) => {
  try {
    // 1. Find the highest milestone the user qualifies for that hasn't been paid yet

    const milestoneQuery = await client.query(
      `SELECT m.id, m.milestone_name, m.reward_cash, m.cash_com, lc.team_size
       FROM level_milestones m
       JOIN level_commissions lc ON m.level_id = lc.id
       WHERE lc.team_size <= $1 
       AND NOT EXISTS (
         SELECT 1 FROM transactions 
         WHERE user_id = $2 
         AND category = 'milestone' 
         AND remarks LIKE '%' || m.milestone_name || '%'
       )
       ORDER BY lc.team_size DESC LIMIT 1`,
      [currentPaidPairs, userId],
    );

    if (milestoneQuery.rows.length > 0) {
      const milestone = milestoneQuery.rows[0];

      try {
        const userInfo = await db.query(
          "SELECT u.id, u.full_name,u.referral_code, u.phone, u.business_level, l.level_name FROM users u left join level_commissions l on l.level_no = u.business_level WHERE u.id = $1",
          [userId],
        );

        const user = userInfo.rows[0];

        // await generateAndSaveIdCard({
        //   userId,
        //   businessLevel: user.level_name,
        //   fullName: user?.full_name,
        //   referralCode: user?.referral_code,
        //   phone: user?.phone,
        // });
      } catch (e) {
        // Do not fail order/commission if ID generation fails
        console.error("ID card generation failed:", e);
      }

      // reward_cash and cash_com are stored as percentage now.
      // Calculate actual amounts FIRST, then credit wallets/transactions.
      const rewardPercent = parseFloat(milestone.reward_cash) || 0;
      const cashComPercent = parseFloat(milestone.cash_com) || 0;

      // If milestone tables store percentage against totalMatchingAmount,
      // then actual reward = totalMatchingAmount * (percent/100).
      // (totalMatchingAmount is the purchase sub_total merged used for milestone eligibility).
      const rewardAmount =
        newPairs * (totalMatchingAmount * (rewardPercent / 100));
      const cashCommissionAmount =
        newPairs * (totalMatchingAmount * (cashComPercent / 100));

      // 2. Update wallets (separate credits)
      // reward_cash -> wallets.company_fund
      await client.query(
        `UPDATE wallets
         SET company_fund = company_fund + $1,
         total_amount = total_amount + $3
         WHERE user_id = $2`,
        [rewardAmount, userId, cashCommissionAmount],
      );

      // 3. Log separate transactions
      // 3a) Milestone reward transaction
      await client.query(
        `INSERT INTO transactions (user_id, amount, type, category, status, remarks)
         VALUES ($1, $2, 'credit', 'milestone', 'completed', $3)`,
        [
          userId,
          rewardAmount,
          `Milestone Reached: ${milestone.milestone_name} (Team Size: ${milestone.team_size}) | reward_cash=${rewardPercent}%`,
        ],
      );

      // 3b) Cash commission transaction
      if (cashCommissionAmount > 0) {
        await client.query(
          `INSERT INTO transactions (user_id, amount, type, category, status, remarks)
           VALUES ($1, $2, 'credit', 'commission', 'completed', $3)`,
          [
            userId,
            cashCommissionAmount,
            `Milestone Cash Commission: ${milestone.milestone_name} (Team Size: ${milestone.team_size}) | cash_com=${cashComPercent}%`,
          ],
        );
      }

      console.log(
        `Milestone ${milestone.milestone_name} credited to User ${userId}`,
      );

      // return { success: true, name: milestone.milestone_name };
    }
  } catch (error) {
    console.error("Milestone Distribution Error:", error);
  }
};

module.exports = MilestonDistribution;
