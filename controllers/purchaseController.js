const db = require("../config/db");
// exports.placePO = async (req, res) => {
//   const client = await db.connect(); // Database connection
//   try {
//     await client.query("BEGIN"); // Transaction Start

//     const userId = req.user.id;
//     const { packageId, amount, paymentMethod } = req.body;

//     // 1. Order Insert Karein
//     // const orderRes = await client.query(
//     //   `INSERT INTO orders (user_id, total_amount, payment_status, order_status)
//     //          VALUES ($1, $2, 'paid', 'completed') RETURNING id`,
//     //   [userId, amount],
//     // );

//     const package = await client.query(`SELECT * FROM packages WHERE id = $1`, [
//       packageId,
//     ]);

//     if (package.rows.length == 0) {
//       return res.json({ success: false, message: "Package id invalid" });
//     }

//     const package_json = JSON.stringify(package.rows[0]);

//     // 2. User Package Activate Karein
//     await client.query(
//       `INSERT INTO user_packages (user_id, package_id, package_details, amount, status, payment_method, activated_at)
//              VALUES ($1, $2, $3, $4, $5, 'activated', NOW())`,
//       [userId, packageId, package_json, amount, paymentMethod],
//     );

//     // generate own commission
//     // ============================

//     const commConfigOWN = await client.query(
//       `SELECT commission_percentage FROM level_commissions
//                      WHERE level_no = 1`,
//       [],
//     );

//     const o_rate = commConfigOWN.rows[0]?.commission_percentage || 0; // Default 10%
//     const o_commissionAmount = amount * (o_rate / 100);

//     // E. Commission Credit Karein
//     await client.query(
//       `INSERT INTO transactions (user_id, amount, type, category, source_user_id, status, remarks)
//                      VALUES ($1, $2, 'credit', 'commission', $3, 'pending', '30-day holding period applies to this commission.')`,
//       [userId, o_commissionAmount, userId],
//     );

//     // F. Wallet Balance aur Paid Pairs update karein
//     await client.query(
//       `UPDATE wallets SET pending_amount = pending_amount + $1 WHERE user_id = $2`,
//       [o_commissionAmount, userId],
//     );

//     // ============================
//     // generate own commission END

//     // 3. Upline Traversal & Commission Logic (MLM Part)
//     // binary_path @> ka use karke saare uplines nikalein
//     const uplines = await client.query(
//       `SELECT id, binary_path, nlevel(binary_path) as level
//              FROM users
//              WHERE binary_path @> (SELECT binary_path FROM users WHERE id = $1)
//              AND id != $1
//              ORDER BY level DESC`,
//       [userId],
//     );

//     let currentUserPath = (
//       await client.query("SELECT binary_path FROM users WHERE id = $1", [
//         userId,
//       ])
//     ).rows[0].binary_path;

//     console.log("upline data - ", uplines.rows);

//     const newUserLevel = (await client.query("SELECT nlevel(binary_path) FROM users WHERE id = $1", [userId])).rows[0].nlevel;

//     for (let upline of uplines.rows) {
//       // A. Check karein ki naya user upline ke Left mein hai ya Right mein
//       // subpath logic: agar upline path ke turant baad '.1' hai toh Left, '.2' hai toh Right
//       const isLeft = currentUserPath.includes(`${upline.binary_path}.1`);
//       const legColumn = isLeft ? "left_count" : "right_count";

//       // B. Leg Count badhayein
//       const walletUpdate = await client.query(
//         `UPDATE wallets SET ${legColumn} = ${legColumn} + 1
//                  WHERE user_id = $1 RETURNING left_count, right_count, paid_pairs`,
//         [upline.id],
//       );

//       console.log("wallet updates- ", walletUpdate.rows);

//       const { left_count, right_count, paid_pairs } = walletUpdate.rows[0];

//       // C. Matching Pair Logic
//       const currentMatches = Math.min(left_count, right_count);
//       const newPairs = currentMatches - paid_pairs;

//       console.log("new pair - ", newPairs, currentMatches);

//       if (newPairs > 0) {
//         const relativeLevel = newUserLevel - upline.level;
//         // D. Level Commission Rate Fetch Karein (Upline ke level ke hisaab se)
//         const commConfig = await client.query(
//           `SELECT commission_percentage FROM level_commissions
//                      WHERE level_no = (SELECT business_level FROM users WHERE id = $1)`,
//           [upline.id],
//         );

//         const rate = commConfig.rows[0]?.commission_percentage || 0; // Default 10%
//         const commissionAmount = newPairs * (amount * ((rate * 2) / 100));

//         // E. Commission Credit Karein
//         await client.query(
//           `INSERT INTO transactions (user_id, amount, type, category, source_user_id, status)
//                      VALUES ($1, $2, 'credit', 'commission', $3, 'completed')`,
//           [upline.id, commissionAmount, userId],
//         );

//         // F. Wallet Balance aur Paid Pairs update karein
//         await client.query(
//           `UPDATE wallets SET total_amount = total_amount + $1, paid_pairs = $2 WHERE user_id = $3`,
//           [commissionAmount, currentMatches, upline.id],
//         );
//       }
//     }

//     // update status is active
//     const updatedUser = await client.query(
//       `UPDATE users SET is_active = true WHERE id = $1`,
//       [userId],
//     );

//     await client.query("COMMIT"); // Sab sahi raha toh save karein
//     res.status(200).json({
//       success: true,
//       message: "Order placed and commissions distributed",
//       user: updatedUser,
//     });
//   } catch (error) {
//     await client.query("ROLLBACK"); // Error aane par sab cancel
//     console.error(error);
//     res.status(500).json({ success: false, error: "Transaction failed" });
//   } finally {
//     client.release();
//   }
// };

exports.placePO = async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const userId = req.user.id;
    const { packageId, amount, paymentMethod } = req.body;

    // 1. Package Validation
    const packageQuery = await client.query(
      `SELECT * FROM packages WHERE id = $1`,
      [packageId],
    );
    if (packageQuery.rows.length === 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ success: false, message: "Package ID is invalid" });
    }
    const packageJson = JSON.stringify(packageQuery.rows[0]);

    // 2. User Package Activation
    await client.query(
      `INSERT INTO user_packages (user_id, package_id, package_details, amount, status, payment_method, activated_at)
       VALUES ($1, $2, $3, $4, 'activated', $5, NOW())`,
      [userId, packageId, packageJson, amount, paymentMethod],
    );

    // 3. Self Commission (Cashback - Relative Level 1 logic)
    const commConfigOWN = await client.query(
      `SELECT commission_percentage FROM level_commissions WHERE level_no = 1`,
    );
    const ownRate = commConfigOWN.rows[0]?.commission_percentage || 0;
    const ownCommission = amount * (ownRate / 100);

    await client.query(
      `INSERT INTO transactions (user_id, amount, type, category, source_user_id, status, remarks)
       VALUES ($1, $2, 'credit', 'commission', $1, 'pending', '30-day holding period applies to self commission.')`,
      [userId, ownCommission],
    );
    await client.query(
      `UPDATE wallets SET pending_amount = pending_amount + $1 WHERE user_id = $2`,
      [ownCommission, userId],
    );

    // 4. Upline Traversal & Commission Logic
    // nlevel check ensure karta hai ki parallel users (jaise 37 aur 39) ek dusre ko commission na dein
    const uplineQuery = await client.query(
      `SELECT id, phone, binary_path, nlevel(binary_path) as level 
       FROM users 
       WHERE binary_path @> (SELECT binary_path FROM users WHERE id = $1) 
       AND nlevel(binary_path) < (SELECT nlevel(binary_path) FROM users WHERE id = $1)
       AND id != $1 
       ORDER BY level DESC`,
      [userId],
    );
    const uplines = uplineQuery.rows;
    console.log("uplines - ", uplines);

    const userDataRes = await client.query(
      "SELECT binary_path, nlevel(binary_path) as depth FROM users WHERE id = $1",
      [userId],
    );
    const currentUserPath = userDataRes.rows[0].binary_path;
    const newUserDepth = userDataRes.rows[0].depth;

    console.log("user idat - ", userDataRes.rows);

    for (let upline of uplines) {
      const isLeft = currentUserPath.startsWith(`${upline.binary_path}.1`);
      const legColumn = isLeft ? "left_count" : "right_count";

      console.log("leg coumns - ", legColumn);

      const walletUpdate = await client.query(
        `UPDATE wallets SET ${legColumn} = ${legColumn} + 1
         WHERE user_id = $1 RETURNING left_count, right_count, paid_pairs`,
        [upline.id],
      );

      const { left_count, right_count, paid_pairs } = walletUpdate.rows[0];

      const currentMatches = Math.min(left_count, right_count);
      const newPairs = currentMatches - paid_pairs;

      console.log("new pairs - ", currentMatches, paid_pairs, newPairs);

      if (newPairs > 0) {
        // D. Relative Level Calculation (Jo aapne manga tha)
        // newUserDepth (e.g. 3) - upline.level (e.g. 2) = Level 1 (Immediate Parent)
        const relativeLevel = newUserDepth - upline.level;

        console.log("relattive level - ", relativeLevel);

        const commConfig = await client.query(
          `SELECT commission_percentage FROM level_commissions WHERE level_no = $1`,
          [relativeLevel],
        );

        const rate = commConfig.rows[0]?.commission_percentage || 0;
        const commissionAmount = newPairs * (amount * (rate / 100));
        console.log("comision amoutn - ", commissionAmount);

        if (commissionAmount > 0) {
          // E. Transaction Record
          await client.query(
            `INSERT INTO transactions (user_id, amount, type, category, source_user_id, status, remarks)
             VALUES ($1, $2, 'credit', 'commission', $3, 'completed', $4)`,
            [
              upline.id,
              commissionAmount,
              userId,
              `Matching - ${relativeLevel}`,
            ],
          );

          // F. Wallet Balance & Pair Counter Update
          await client.query(
            `UPDATE wallets SET total_amount = total_amount + $1, paid_pairs = $2 WHERE user_id = $3`,
            [commissionAmount, currentMatches, upline.id],
          );
        }
      }
    }

    // 5. Finalize: Mark Active and Return User
    const updatedUserRes = await client.query(
      `UPDATE users SET is_active = true WHERE id = $1 RETURNING *`,
      [userId],
    );
    const updatedUser = updatedUserRes.rows[0];
    if (updatedUser) delete updatedUser.password_hash;

    await client.query("COMMIT");
    res.status(200).json({
      success: true,
      message: "Package activated and commissions distributed successfully.",
      user: updatedUser,
    });
    // res
    //   .status(500)
    //   .json({ success: false, error: "Transaction failed. Please try again." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Critical Error in placePO:", error);
    res
      .status(500)
      .json({ success: false, error: "Transaction failed. Please try again." });
  } finally {
    client.release();
  }
};

exports.getPlans = async (req, res) => {
  try {
    const plan = await db.query("SELECT * FROM packages ", []);

    res.json({
      success: true,
      message: "Plans",
      data: plan.rows,
    });
  } catch (error) {
    console.log("error in getting plan - ", error);
    res.json({ status: false, message: "Server Internal Error", error });
  }
};
