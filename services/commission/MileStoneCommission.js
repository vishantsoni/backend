const MilestonDistribution = async (
  client,
  userId,
  currentPaidPairs,
  newPairs,
  totalMatchingAmount, // यह सिर्फ करंट पेयर का अमाउंट है
) => {
  try {
    // 1. चेक करें कि यूजर किस माइलस्टोन के टारगेट को टच कर चुका है
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

      // अगर करंट पेयर्स अभी भी टारगेट टीम साइज से कम हैं, तो बाहर हो जाएं (वेट करें)
      if (currentPaidPairs < milestone.team_size) {
        console.log(
          `[Milestone] User ${userId} has ${currentPaidPairs}/${milestone.team_size} pairs. Waiting for level completion.`,
        );
        return;
      }

      console.log(
        `🎉 Level Target Achieved (${milestone.team_size} Pairs)! Calculating accumulated commission...`,
      );

      // 2. 🔥 PROBLEM SOLVED HERE: पिछले सभी पेयर्स का टोटल मैचिंग अमाउंट निकालें
      // हम pair_matches टेबल से उतने पेयर्स उठाएंगे जितना इस माइलस्टोन का टारगेट (team_size) है।
      const accumulatedAmountQuery = await client.query(
        `SELECT SUM(total_matching_amount) as total_level_volume
         FROM (
           SELECT total_matching_amount 
           FROM pair_matches 
           WHERE upline_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         ) as subquery`,
        [userId, milestone.team_size],
      );

      // अगर डेटाबेस में अभी करंट पेयर इंसर्ट नहीं हुआ है, तो हम बैकअप में
      // आए हुए totalMatchingAmount को जोड़ लेंगे।
      let totalLevelVolume =
        parseFloat(accumulatedAmountQuery.rows[0].total_level_volume) || 0;

      if (totalLevelVolume === 0) {
        totalLevelVolume = totalMatchingAmount;
      }

      const rewardPercent = parseFloat(milestone.reward_cash) || 0;
      const cashComPercent = parseFloat(milestone.cash_com) || 0;

      // 3. 🔥 अब पूरे लेवल के संचित (Accumulated) वॉल्यूम पर कमीशन निकलेगा!
      // यहाँ हम 'newPairs' से मल्टीप्लाई नहीं करेंगे, क्योंकि हम पूरे $totalLevelVolume पर डायरेक्ट % लगा रहे हैं।
      const rewardAmount = totalLevelVolume * (rewardPercent / 100);
      const cashCommissionAmount = totalLevelVolume * (cashComPercent / 100);

      console.log(
        `[Milestone Calc] Total Level Volume: ${totalLevelVolume}, Reward: ${rewardAmount}, Cash Com: ${cashCommissionAmount}`,
      );

      if (rewardAmount > 0 || cashCommissionAmount > 0) {
        // wallets अपडेट करें
        await client.query(
          `UPDATE wallets
           SET company_fund = company_fund + $1,
               total_amount = total_amount + $3
           WHERE user_id = $2`,
          [rewardAmount, userId, cashCommissionAmount],
        );

        // ट्रांजैक्शन लॉग (Milestone Reward)
        await client.query(
          `INSERT INTO transactions (user_id, amount, type, category, status, remarks)
           VALUES ($1, $2, 'credit', 'milestone', 'completed', $3)`,
          [
            userId,
            rewardAmount,
            `Milestone Completed: ${milestone.milestone_name} (${milestone.team_size} Pairs) | Total Volume: ${totalLevelVolume} | reward_cash=${rewardPercent}%`,
          ],
        );

        // ट्रांजैक्शन लॉग (Cash Commission)
        if (cashCommissionAmount > 0) {
          await client.query(
            `INSERT INTO transactions (user_id, amount, type, category, status, remarks)
             VALUES ($1, $2, 'credit', 'commission', 'completed', $3)`,
            [
              userId,
              cashCommissionAmount,
              `Milestone Upgrade Commission: ${milestone.milestone_name} | Total Volume: ${totalLevelVolume} | cash_com=${cashComPercent}%`,
            ],
          );
        }

        console.log(
          `🎉 SUCCESS: Milestone ${milestone.milestone_name} distributed successfully for User ${userId}`,
        );
      }
    }
  } catch (error) {
    console.error("Milestone Distribution Error:", error);
  }
};

module.exports = MilestonDistribution;
