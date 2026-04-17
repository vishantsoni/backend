const db = require('../config/db');

exports.getReviews = async (req, res) => {
  try {
    const { product_id } = req.params;
    const reviews = await db.query(
      `SELECT r.*, u.name as user_name
       FROM e_reviews r
       JOIN ecom_user u ON r.user_id = u.id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC`,
      [product_id]
    );

    // Calculate average rating
    const avgRating = reviews.rows.length > 0 
      ? reviews.rows.reduce((sum, r) => sum + r.rating, 0) / reviews.rows.length 
      : 0;

    res.json({
      status: true,
      reviews: reviews.rows,
      average_rating: parseFloat(avgRating.toFixed(1)),
      total_reviews: reviews.rows.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

exports.addReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, rating, review } = req.body;

    if (!product_id || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ status: false, error: 'Valid product_id and rating (1-5) required' });
    }

    const result = await db.query(
      `INSERT INTO e_reviews (user_id, product_id, rating, review)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, product_id, rating, review || null]
    );

    res.status(201).json({ status: true, review: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: false, error: 'Server error' });
  }
};

