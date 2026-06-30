const MilestonDistribution = require("./MileStoneCommission");

const LevelCommissionDistribution = async (client, userId, body) => {
  try {
    const { amount, razorpay_order_id, order_id } = body;

    // user data & upline traversal
    const userDataRes = await client.query(
      "SELECT binary_path, nlevel(binary_path) as depth FROM users WHERE id = $1",
      [userId],
    );
    if (userDataRes.rows.length === 0)
      return { status: false, message: "User not found" };

    const currentUserPath = userDataRes.rows[0].binary_path;
    const newUserDepth = userDataRes.rows[0].depth;

    const uplineQuery = await client.query(
      `SELECT id, binary_path, nlevel(binary_path) as level
       FROM users
       WHERE binary_path @> $1 AND id != $2
       ORDER BY level DESC`,
      [currentUserPath, userId],
    );
    const uplines = uplineQuery.rows;

    // main matching loop
    for (let upline of uplines) {
      const isLeft = currentUserPath.startsWith(`${upline.binary_path}.1`);
      const legColumn = isLeft ? "left_count" : "right_count";
      const oppositeLegPath = isLeft
        ? `${upline.binary_path}.2`
        : `${upline.binary_path}.1`;

      // A. Wallet Counter Update (Old Logic)
      const walletUpdate = await client.query(
        `UPDATE wallets SET ${legColumn} = ${legColumn} + 1
         WHERE user_id = $1 RETURNING left_count, right_count, paid_pairs`,
        [upline.id],
      );

      const { left_count, right_count, paid_pairs } = walletUpdate.rows[0];

      // B. Pair Verification (Old Logic)
      const currentMatches = Math.min(left_count, right_count);
      const newPairs = currentMatches - paid_pairs;

      if (newPairs > 0) {
        // C. Naya Logic: Find Pending Order in Opposite Leg
        const pendingMatch = await client.query(
          `SELECT o.id, o.sub_total, o.total_amount, o.order_id FROM orders o
           JOIN users u ON o.distributor_id = u.id
           WHERE u.binary_path <@ $1 AND o.commission_status = 'pending'
           ORDER BY o.created_at ASC LIMIT 1`,
          [oppositeLegPath],
        );

        if (pendingMatch.rows.length > 0) {
          const matchedOrder = pendingMatch.rows[0];

          // D. Amount Merging (Current + Matched)
          const totalMatchingAmount =
            parseFloat(amount) + parseFloat(matchedOrder.sub_total);

          // E. Relative Level Calculation (Old Logic)
          const relativeLevel = newUserDepth - upline.level;
          const commConfig = await client.query(
            `SELECT commission_percentage FROM level_commissions WHERE level_no = $1`,
            [relativeLevel],
          );

          const rate = commConfig.rows[0]?.commission_percentage || 0;
          const commissionAmount =
            newPairs * (totalMatchingAmount * (rate / 100));

          if (commissionAmount > 0) {
            // F. Mark Orders as Paid
            await client.query(
              `UPDATE orders SET commission_status = 'paid' WHERE id = $1`,
              [matchedOrder.id],
            );
            await client.query(
              `UPDATE orders SET commission_status = 'paid' WHERE order_id = $1`,
              [order_id],
            );

            // G. Final Wallet & Transaction Update
            const walletUpdateFinal = await client.query(
              `UPDATE wallets SET total_amount = total_amount + $1, paid_pairs = $2 WHERE user_id = $3 RETURNING paid_pairs`,
              [commissionAmount, currentMatches, upline.id],
            );

            const updatedPaidPairs = walletUpdateFinal.rows[0].paid_pairs;

            // --- INTEGRATION START: Milestone Check ---
            // This checks if the user hit any milestone based on their new paid_pairs count
            await MilestonDistribution(
              client,
              upline.id,
              updatedPaidPairs,
              newPairs,
              totalMatchingAmount,
            );
            // --- INTEGRATION END ---

            await client.query(
              `INSERT INTO transactions (user_id, amount, type, category, source_user_id, status, remarks)
               VALUES ($1, $2, 'credit', 'commission', $3, 'completed', $4)`,
              [
                upline.id,
                commissionAmount,
                userId,
                `Pair Match: Order ${matchedOrder.order_id} & ${order_id}`,
              ],
            );
          }
        }
      } else {
        // Agar pair nahi bana, toh order ko pending mark karein
        await client.query(
          `UPDATE orders SET commission_status = 'pending' WHERE order_id = $1`,
          [order_id],
        );
      }
    }
  } catch (err) {
    console.log("Level commission error log - ", err);
  }
};

module.exports = LevelCommissionDistribution;
