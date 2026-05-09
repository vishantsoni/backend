const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const db = require("../config/db");

// Regex helpers (match other controller style)
const phoneRegex = /^[6-9]\d{9}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Keep transporter local to avoid modifying utils/otpService.js (which is tied to `users` table)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "co0lv7264@gmail.com",
    pass: "jtdqxcgvskkejeyq",
  },
  tls: {
    rejectUnauthorized: false,
  },
});

async function sendOtpByContact({ email, phone, otp, purpose }) {
  const subject = `Your ${purpose} OTP`;
  const message = `Your OTP is ${otp}. Valid for 5 minutes.`;

  if (email) {
    await transporter.sendMail({ to: email, subject, text: message });
    return "email";
  }

  if (phone) {
    // TODO: integrate SMS provider (Twilio/etc.)
    console.log(`SMS to ${phone}: ${message}`);
    return "sms";
  }

  throw new Error("No contact method available");
}

async function resolveEcomUserByIdentifier(identifier) {
  let where = "";
  const isPhone = phoneRegex.test(identifier);
  const isEmail = emailRegex.test(identifier);

  if (isPhone) where = "phone = $1";
  else if (isEmail) where = "email = $1";
  else return null;

  const result = await db.query(
    `SELECT id, email, phone, status, password FROM ecom_user WHERE ${where} LIMIT 1`,
    [identifier],
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}

async function storeOtp({ userId, otp, purpose, expiresAt }) {
  await db.query(
    `INSERT INTO user_otps (user_id, otp, purpose, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, purpose) DO UPDATE
     SET otp = $2, expires_at = $4`,
    [userId, otp, purpose, expiresAt],
  );
}

function getPurpose() {
  return "reset-password-ecom";
}

exports.sendForgotPasswordOtp = async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res
        .status(400)
        .json({ status: false, error: "Identifier is required" });
    }

    const ecomUser = await resolveEcomUserByIdentifier(identifier);
    if (!ecomUser) {
      return res.status(404).json({ status: false, error: "User not found" });
    }

    if (ecomUser.status === false) {
      return res.status(400).json({ status: false, error: "Account disabled" });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const purpose = getPurpose();

    await storeOtp({ userId: ecomUser.id, otp, purpose, expiresAt });

    const sentTo = await sendOtpByContact({
      email: ecomUser.email,
      phone: ecomUser.phone,
      otp,
      purpose,
    });

    res.json({
      status: true,
      message: `OTP sent to ${sentTo}`,
      expiresAt,
    });
  } catch (err) {
    console.error("sendForgotPasswordOtp error:", err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};

exports.resetForgotPassword = async (req, res) => {
  try {
    const { identifier, newPassword, otp } = req.body;

    if (!identifier || !newPassword || !otp) {
      return res
        .status(400)
        .json({
          status: false,
          error: "identifier, newPassword and otp are required",
        });
    }

    const ecomUser = await resolveEcomUserByIdentifier(identifier);
    if (!ecomUser) {
      return res.status(404).json({ status: false, error: "User not found" });
    }

    if (ecomUser.status === false) {
      return res.status(400).json({ status: false, error: "Account disabled" });
    }

    const purpose = getPurpose();

    const otpResult = await db.query(
      `SELECT id, otp, expires_at
       FROM user_otps
       WHERE user_id = $1 AND purpose = $2`,
      [ecomUser.id, purpose],
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ status: false, error: "No OTP found" });
    }

    const dbOtp = otpResult.rows[0];

    if (new Date() > new Date(dbOtp.expires_at)) {
      return res.status(400).json({ status: false, error: "OTP has expired" });
    }

    if (String(dbOtp.otp) !== String(otp)) {
      return res.status(400).json({ status: false, error: "Incorrect OTP" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await db.query("BEGIN");
    try {
      await db.query(`UPDATE ecom_user SET password = $1 WHERE id = $2`, [
        hashedPassword,
        ecomUser.id,
      ]);

      await db.query(
        `DELETE FROM user_otps WHERE user_id = $1 AND purpose = $2`,
        [ecomUser.id, purpose],
      );

      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }

    res.json({
      status: true,
      message: "Password has been reset successfully. You can now login.",
    });
  } catch (err) {
    console.error("resetForgotPassword error:", err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};
