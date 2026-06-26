const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const db = require("../config/db");
const { transporter } = require("../utils/otpService");

// Regex helpers (match other controller style)
const phoneRegex = /^[6-9]\d{9}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Keep transporter local to avoid modifying utils/otpService.js (which is tied to `users` table)
// const transporter = nodemailer.createTransport({
//   host: "smtp.gmail.com",
//   port: 465,
//   secure: true,
//   auth: {
//     user: "co0lv7264@gmail.com",
//     pass: "jtdqxcgvskkejeyq",
//   },
//   tls: {
//     rejectUnauthorized: false,
//   },
// });

// const transporter = nodemailer.createTransport({
//   host: "webmail.feelsafeco.in",
//   port: 587,
//   secure: false, // Use SSL
//   auth: {
//     user: "no-reply@feelsafeco.in",
//     pass: "Vats1992*", // Paste the new code here
//   },
//   tls: {
//     // This helps if you are running on localhost or a restricted network
//     rejectUnauthorized: false,
//   },
// });

async function sendOtpByContact({ email, phone, otp, purpose }) {
  const subject = `${otp} is your Feel Safe verification code - ( ${purpose} )`;
  const htmlContent = `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <!-- Brand Title -->
    <div style="text-align: center; margin-bottom: 24px;">
      <h2 style="color: #1C1C1C; margin: 0; font-size: 26px; font-weight: bold; letter-spacing: -0.5px;">Feel Safe</h2>
    </div>
    
    <p style="color: #334155; font-size: 16px; line-height: 1.5; margin-top: 0;">Hello,</p>
    
    <p style="color: #334155; font-size: 16px; line-height: 1.5;">We received a request for a <strong>${purpose}</strong> on your account. Please use the verification code below to proceed:</p>
    
    <!-- Big OTP Display Box -->
    <div style="text-align: center; margin: 32px 0;">
      <div style="font-size: 34px; font-weight: 700; letter-spacing: 6px; color: #00A9E0; background-color: #f8fafc; padding: 14px 28px; border-radius: 8px; display: inline-block; border: 1px dashed #cbd5e1;">
        ${otp}
      </div>
    </div>
    
    <p style="color: #64748b; font-size: 14px; text-align: center; margin-bottom: 24px;">
      This code is valid for <strong>5 minutes</strong>.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    
    <!-- Security Footer -->
    <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-bottom: 0;">
      <strong>Security Note:</strong> Never share this OTP with anyone. Our team will never ask for it. If you did not request this, please ignore this message securely.
    </p>
  </div>
  `;

  // Plain text fallback line
  const plainTextMessage = `Your Feel Safe verification code is ${otp}. Valid for 5 minutes.`;

  if (email) {
    try {
      // Capture the response info object from Nodemailer
      const info = await transporter.sendMail({
        from: '"Feel Safe" <no-reply@feelsafeco.in>', // It's best practice to explicitly add your 'from' address
        to: email,
        subject,
        text: plainTextMessage,
        html: htmlContent,
      });

      // Check if the email address was rejected by your local mail server
      if (info.rejected.length > 0) {
        console.error(`\n\nEmail rejected by server for: ${info.rejected}`);
        throw new Error(
          `Email address ${email} was rejected by the mail server.`,
        );
      }

      console.log(`Email successfully sent! Message ID: ${info.messageId}`);
      return "email";
    } catch (emailError) {
      // This catches connection issues, authentication failures, or downtime
      console.error("\n\nNodemailer transport error:", emailError);
      throw new Error(`Failed to send email OTP: ${emailError.message}`);
    }
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
      return res.status(400).json({
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

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = await db.query(
      "SELECT password FROM ecom_user WHERE id = $1",
      [userId],
    );
    if (user.rows.length === 0)
      return res.status(404).json({ status: false, error: "User not found" });

    const isMatch = await bcrypt.compare(
      currentPassword,
      user.rows[0].password,
    );
    if (!isMatch)
      return res
        .status(400)
        .json({ status: false, error: "Invalid current password" });

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE ecom_user SET password = $1 WHERE id = $2", [
      newHash,
      userId,
    ]);

    res.json({ status: true, message: "Password changed successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: "Server error" });
  }
};
