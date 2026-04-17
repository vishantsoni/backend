const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  try {
    const { name, phone, email, password, distributor_code } = req.body;

    // Validate - phone mandatory, email optional
    if (!name || !phone || !password) {
      return res.status(400).json({ status: false, error: 'Name, phone, password required' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Check unique phone (email optional, check if provided)
    let whereClause = 'phone = $1';
    const checkParams = [phone];
    let paramIndex = 2;
    if (email) {
      whereClause += ` OR email = $${paramIndex}`;
      checkParams.push(email);
      paramIndex++;
    }

    const check = await db.query(`SELECT id FROM ecom_user WHERE ${whereClause}`, checkParams);
    if (check.rows.length > 0) {
      return res.status(400).json({ status: false, error: 'Phone/email already registered' });
    }

    // Create user - email nullable
    let insertFields = 'name, phone, password, distributor_code';
    let insertValues = [name, phone, hashedPassword, distributor_code || null];
    let insertParamsIndex = 5;
    if (email) {
      insertFields += ', email';
      insertValues.push(email);  // Prepend to match $1=email
    } else {
      insertValues.push(null);  // $1=null for email
    }

    const result = await db.query(
      `INSERT INTO ecom_user (${insertFields})
       VALUES (${insertValues.map((_, i) => `$${i+1}`).join(', ')})
       RETURNING id, name, COALESCE(email, null) as email, phone, distributor_code, status, created_at`,
      insertValues
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    
    res.status(201).json({
      status: true,
      message: 'User registered successfully',
      // insertFields,
      // insertValues
      user,
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { phone, email, password } = req.body;
    if (!phone && !email) {
      return res.status(400).json({ status: false, error: 'Phone or email required' });
    }
    if (!password) {
      return res.status(400).json({ status: false, error: 'Password required' });
    }

    const whereClause = phone ? 'phone = $1' : 'email = $1';
    const loginId = phone || email;
    const user = await db.query(
      `SELECT id, name, email, phone, password, status FROM ecom_user WHERE ${whereClause}`,
      [loginId]
    );

    if (user.rows.length === 0) {
      return res.status(400).json({ status: false, error: 'Invalid credentials' });
    }

    const validUser = user.rows[0];
    if (!validUser.status) {
      return res.status(400).json({ status: false, error: 'Account disabled' });
    }

    const isMatch = await bcrypt.compare(password, validUser.password);
    if (!isMatch) {
      return res.status(400).json({ status: false, error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: validUser.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    delete validUser.password;
    res.json({
      status: true,
      message: 'Login successful',
      user: validUser,
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

exports.authMe = async (req, res) => {
  try {
    
    const user = await db.query(
      'SELECT id, name, email, phone, distributor_code, status FROM ecom_user WHERE id = $1',
      [req.user.id]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ status: false, error: 'User not found' });
    }
    res.json({ status: true, user: user.rows[0] });

  } catch (error) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
}