const db = require('../config/db');

exports.createPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { order_id, payment_method, amount, transaction_id, status = 'pending' } = req.body;

    if (!order_id || !amount || !payment_method) {
      return res.status(400).json({ status: false, error: 'order_id, amount, payment_method required' });
    }

    const result = await db.query(
      `INSERT INTO e_payments (order_id, payment_method, transaction_id, amount, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [order_id, payment_method, transaction_id || null, amount, status]
    );

    res.status(201).json({ status: true, payment: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const userId = req.user.id;
    const { order_id } = req.query;

    let query = `
      SELECT * FROM e_payments 
      WHERE order_id = ANY(
        SELECT id FROM orders WHERE user_id = $1  -- Assume MLM orders or create e_orders
      )
    `;
    const params = [userId];

    if (order_id) {
      query += ' AND order_id = $2';
      params.push(order_id);
    }

    query += ' ORDER BY created_at DESC';

    const payments = await db.query(query, params);
    res.json({ status: true, payments: payments.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { payment_id } = req.params;
    const { status, paid_at } = req.body;

    await db.query(
      'UPDATE e_payments SET status = $1, paid_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [status, paid_at || new Date(), payment_id]
    );

    res.json({ status: true, message: 'Payment status updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

