const express = require('express');
const router = express.Router();

const ecomAuth = require('../middleware/ecomAuth');
const ecomIsAdmin = require('../middleware/ecomIsAdmin');

// Controllers
const {
  register,
  login,
  authMe
} = require('../controllers/ecomAuthController');
const {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
} = require('../controllers/ecomUserController');
const {
  getCart,
  addCartItem,
  updateCartItem,
  updateCartItemQuantity,
  removeCartItem,
  clearCart
} = require('../controllers/ecomCartController');
const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  toggleWishlist
} = require('../controllers/ecomWishlistController');
const {
  getReviews,
  addReview
} = require('../controllers/ecomReviewController');
const {
  createPayment,
  getPayments,
  updatePaymentStatus
} = require('../controllers/ecomPaymentController');

// Auth Routes (public)
router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', ecomAuth, authMe);

// Profile & Addresses (auth)
router.get('/profile', ecomAuth, getProfile);
router.put('/profile', ecomAuth, updateProfile);

router.get('/addresses', ecomAuth, getAddresses);
router.post('/addresses', ecomAuth, addAddress);
router.put('/addresses/:id', ecomAuth, updateAddress);
router.delete('/addresses/:id', ecomAuth, deleteAddress);
router.put('/addresses/:id/default', ecomAuth, setDefaultAddress);

// Cart (auth)
router.get('/cart', ecomAuth, getCart);
router.post('/cart/items', ecomAuth, addCartItem);
router.put('/cart/items', ecomAuth, updateCartItem);
router.delete('/cart/items/:item_id', ecomAuth, removeCartItem);
router.put('/cart/items/:id/updateQuantity', ecomAuth, updateCartItemQuantity);
router.delete('/cart/clear', ecomAuth, clearCart);

// Wishlist (auth)
router.get('/wishlist', ecomAuth, getWishlist);
router.post('/wishlist', ecomAuth, addToWishlist);
router.delete('/wishlist/:product_id', ecomAuth, removeFromWishlist);
router.post('/wishlist/toggle', ecomAuth, toggleWishlist);

// Reviews
router.get('/reviews/:product_id', getReviews);
router.post('/reviews', ecomAuth, addReview);

// Payments (auth)
router.post('/payments', ecomAuth, createPayment);
router.get('/payments', ecomAuth, getPayments);
router.put('/payments/:payment_id', [ecomAuth, ecomIsAdmin], updatePaymentStatus);

module.exports = router;

