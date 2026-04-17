const jwt = require('jsonwebtoken');
const db = require('../config/db');

const ecomAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ status: false, error: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Fetch ecom_user
    const user = await db.query(
      'SELECT id, name, email, phone, distributor_code, status FROM ecom_user WHERE id = $1',
      [decoded.id]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ status: false, error: 'User not found' });
    }

    const userObj = user.rows[0];
    if (!userObj.status) {
      return res.status(401).json({ status: false, error: 'Account disabled' });
    }

    req.user = userObj;
    next();
  } catch (err) {
    console.error(err);
    res.status(401).json({ status: false, error: 'Token invalid' });
  }
};

module.exports = ecomAuth;

