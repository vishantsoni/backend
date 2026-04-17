const db = require('../config/db');
const bcrypt = require('bcrypt');
const otpService = require('../utils/otpService');
const limitsChecker = require('../utils/limitsChecker');

const HOLD_DAYS = 30;

// Verify transaction PIN
exports.verifyPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const userId = req.user.id;

    if (!pin || pin.length < 4 || pin.length > 6) {
      return res.status(400).json({ success: false, error: 'Invalid PIN length (4-6 digits)' });
    }

    // Check user pin
    const user = await db.query('SELECT transaction_pin_hash FROM users WHERE id = $1', [userId]);
    if (!user.rows[0]?.transaction_pin_hash) {
      return res.status(400).json({ success: false, error: 'Transaction PIN not set. Set PIN first.' });
    }

    const isValid = await bcrypt.compare(pin, user.rows[0].transaction_pin_hash);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid PIN' });
    }

    res.json({ success: true, message: 'PIN verified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Send OTP for transaction
exports.sendOTP = async (req, res) => {
  try {
    const userId = req.user.id;
    const { purpose = 'transfer' } = req.body;

    const result = await otpService.sendOTP(userId, purpose);
    res.json({ 
      success: true, 
      message: `OTP sent to ${result.sentTo}`,
      expiresAt: result.expiresAt 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { otp, purpose = 'transfer' } = req.body;
    const userId = req.user.id;

    const isValid = await otpService.verifyOTP(userId, otp, purpose);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }

    res.json({ success: true, message: 'OTP verified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Transfer to another user (MLM internal transfer)
exports.transferToUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { toUserId, amount, remarks } = req.body;

    // Pre-checks
    await limitsChecker.checkTransferLimits(userId, amount);
    
    // KYC check (assume middleware or here)
    const kyc = await db.query('SELECT kyc_status FROM users WHERE id = $1', [userId]);
    if (!kyc.rows[0]?.kyc_status) {
      return res.status(400).json({ success: false, error: 'KYC required for transactions' });
    }

    // Balance check (use available_balance)
    const balanceRes = await db.query(`
      SELECT COALESCE(total_amount, 0) + COALESCE(pending_amount, 0) as available FROM wallets WHERE user_id = $1
    `, [userId]);
    const available = parseFloat(balanceRes.rows[0]?.available || 0);
    if (available < amount) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }

    // Use pending for commission-like holds? For transfer, deduct from total
    // Assume simple: deduct total, credit receiver total (no hold for P2P, hold on commission)
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Deduct sender
      await client.query(
        'UPDATE wallets SET total_amount = total_amount - $1 WHERE user_id = $2',
        [amount, userId]
      );

      // Credit receiver
      await client.query(`
        INSERT INTO wallets (user_id, total_amount) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET 
          total_amount = wallets.total_amount + $2,
          updated_at = CURRENT_TIMESTAMP
      `, [toUserId, amount]);

      // Log txns
      const txnIdSender = await client.query(
        'INSERT INTO transactions (user_id, amount, type, category, source_user_id, remarks, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [userId, amount, 'debit', 'transfer', toUserId, remarks || 'P2P Transfer', 'completed']
      );

      await client.query(
        'INSERT INTO transactions (user_id, amount, type, category, source_user_id, remarks, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [toUserId, amount, 'credit', 'transfer', userId, remarks || 'P2P Transfer', 'completed']
      );

      // Update limits
      await limitsChecker.updateTransferLimits(userId, amount);

      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: 'Transfer successful',
        txnId: txnIdSender.rows[0].id,
        newBalance: available - amount
      });
    } catch (txnErr) {
      await client.query('ROLLBACK');
      throw txnErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
};

// Withdraw to bank (similar, but pending_amount move to total first? Add status 'pending_approval')
exports.withdraw = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, remarks } = req.body;

    // Same checks as transfer + bank details exist?
    await limitsChecker.checkTransferLimits(userId, amount);
    
    const user = await db.query('SELECT bank_name, account_no, ifsc_code FROM users WHERE id = $1', [userId]);
    if (!user.rows[0]?.account_no) {
      return res.status(400).json({ success: false, error: 'Bank details required' });
    }

    // Balance check (only total_amount for withdraw)
    const balanceRes = await db.query('SELECT COALESCE(total_amount, 0) as total FROM wallets WHERE user_id = $1', [userId]);
    const total = parseFloat(balanceRes.rows[0]?.total || 0);
    if (total < amount) {
      return res.status(400).json({ success: false, error: 'Insufficient withdrawable balance' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query('UPDATE wallets SET total_amount = total_amount - $1 WHERE user_id = $2', [amount, userId]);

      const txnId = await client.query(
        `INSERT INTO transactions (user_id, amount, type, category, remarks, status) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, amount, 'debit', 'withdraw', remarks || 'Bank Withdrawal', 'pending_approval']
      );

      await limitsChecker.updateTransferLimits(userId, amount);

      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: 'Withdrawal requested (pending admin approval)',
        txnId: txnId.rows[0].id
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, error: err.message });
  }
};
