const nodemailer = require('nodemailer');
const db = require('../config/db');
const crypto = require('crypto');

// Transporter config (use .env: EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT || 587,
  secure: false, // true for 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function getUserContact(userId) {
  const result = await db.query(
    'SELECT email, phone, otp_email_count FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0) throw new Error('User not found');
  return result.rows[0];
}

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

async function shouldUseEmail(userId) {
  const user = await getUserContact(userId);
  return user.otp_email_count < 2;
}

exports.sendOTP = async (userId, purpose = 'transaction') => {
  const user = await getUserContact(userId);
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

  // Store OTP in temp table or redis; here simple users otp field temp (extend schema if needed)
  await db.query(
    'INSERT INTO user_otps (user_id, otp, purpose, expires_at) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, purpose) DO UPDATE SET otp = $2, expires_at = $4',
    [userId, otp, purpose, expiresAt]
  ); // Assume user_otps table; create if missing

  const useEmail = await shouldUseEmail(userId);
  const contact = useEmail ? user.email : user.phone;
  const subject = `Your ${purpose} OTP`;
  const message = `Your OTP is ${otp}. Valid for 5 minutes.`;

  if (useEmail) {
    await transporter.sendMail({
      to: user.email,
      subject,
      text: message,
    });
    await db.query('UPDATE users SET otp_email_count = otp_email_count + 1 WHERE id = $1', [userId]);
  } else {
    // TODO: SMS via Twilio
    console.log(`SMS to ${user.phone}: ${message}`);
    // twilioClient.messages.create({...})
  }

  return { sentTo: useEmail ? 'email' : 'sms', expiresAt };
};

exports.verifyOTP = async (userId, otp, purpose = 'transaction') => {
  const result = await db.query(
    'SELECT expires_at FROM user_otps WHERE user_id = $1 AND otp = $2 AND purpose = $3',
    [userId, otp, purpose]
  );
  if (result.rows.length === 0) return false;
  if (new Date() > result.rows[0].expires_at) return false;
  // Cleanup
  await db.query('DELETE FROM user_otps WHERE user_id = $1 AND purpose = $2', [userId, purpose]);
  return true;
};
