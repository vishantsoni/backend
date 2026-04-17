const db = require('../config/db');

exports.getWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const items = await db.query(
      `SELECT wl.*, p.name as product_name, p.slug, p.price
       FROM e_wishlists wl
       LEFT JOIN products p ON wl.product_id = p.id
       WHERE wl.user_id = $1
       ORDER BY wl.created_at DESC`,
      [userId]
    );

    res.json({ status: true, wishlist: items.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

exports.addToWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ status: false, error: 'product_id required' });
    }

    const result = await db.query(
      `INSERT INTO e_wishlists (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING
       RETURNING id`,
      [userId, product_id]
    );

    res.status(201).json({ status: true, message: 'Added to wishlist' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.params;

    await db.query(
      'DELETE FROM e_wishlists WHERE user_id = $1 AND product_id = $2',
      [userId, product_id]
    );

    res.json({ status: true, message: 'Removed from wishlist' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

exports.toggleWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.body;

    const exists = await db.query(
      'SELECT id FROM e_wishlists WHERE user_id = $1 AND product_id = $2',
      [userId, product_id]
    );

    if (exists.rows.length > 0) {
      await db.query('DELETE FROM e_wishlists WHERE user_id = $1 AND product_id = $2', [userId, product_id]);
      return res.json({ status: true, action: 'removed', message: 'Removed from wishlist' });
    } else {
      await db.query('INSERT INTO e_wishlists (user_id, product_id) VALUES ($1, $2)', [userId, product_id]);
      return res.status(201).json({ status: true, action: 'added', message: 'Added to wishlist' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

