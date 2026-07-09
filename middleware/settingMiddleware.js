const db = require("../config/db");
const checkTransaction = async (req, res, next) => {
  try {
    const query = `SELECT * FROM app_settings WHERE setting_key = $1`;
    const result = await db.query(query, ["transaction"]);
    if (result.rows.length == 0) {
      return res
        .status(403)
        .json({ success: false, message: "Transactions not found" });
    }

    const data = result.rows[0]?.setting_value;
    if (data?.withdraw === false) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Withdrawals are disabled! Please wait for admin.",
        });
    }

    next();
  } catch (error) {
    console.error(`Error getting setting for key transaction_enabled:`, error);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};

module.exports = checkTransaction;
