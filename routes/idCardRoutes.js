const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const db = require("../config/db");
const { generateAndSaveIdCard } = require("../utils/idCardService");

// Generates (or refreshes) a user's ID card if not present.
// If already generated, it still regenerates to ensure QR/name are up-to-date.
// Frontend can call this after user activation / milestone.
router.post("/generate", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user data needed for overlays/QR
    const userRes = await db.query(
      `SELECT u.id, u.full_name, u.referral_code, u.phone, u.business_level, u.position, 
      u.created_at, l.level_name 
      FROM users u 
      left join level_commissions l on l.level_no = (u.position - 1)
      WHERE u.id = $1`,
      [userId],
    );

    if (!userRes.rows.length) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const user = userRes.rows[0];

    // Fetch latest approved/any KYC request documents for this user
    // Requirement: kyc_documents.document_type = 'profile'
    // and document belongs to the matching kyc_requests.user_id
    const profileDocRes = await db.query(
      `
      SELECT kd.file_url
      FROM kyc_requests kr
      JOIN kyc_documents kd ON kd.user_id = kr.user_id
      WHERE kr.user_id = $1
        AND kd.document_type = 'profile'
      ORDER BY kr.created_at DESC, kd.updated_at DESC NULLS LAST
      LIMIT 1
      `,
      [userId],
    );

    const profileImageUrl = profileDocRes.rows[0]?.file_url || null;

    const result = await generateAndSaveIdCard({
      userId: user.id,
      businessLevel: user.level_name,
      fullName: user.full_name,
      referralCode: user.referral_code,
      phone: user.phone,
      joinDate: user.created_at,
      profileImagePath: profileImageUrl,
    });

    return res.json({
      status: true,
      message: "ID card generated",
      data: result,
    });
  } catch (err) {
    console.error("ID card generation error:", err);
    return res.status(500).json({
      status: false,
      message: "Server error generating ID card",
    });
  }
});

module.exports = router;
