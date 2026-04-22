const express = require("express");
const router = express.Router();

const ecomAuth = require("../middleware/ecomAuth");
const ecomIsAdmin = require("../middleware/ecomIsAdmin");

// Controllers
const {
  register,
  login,
  authMe,
} = require("../controllers/ecomAuthController");
const {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require("../controllers/ecomUserController");
const {
  getCart,
  addCartItem,
  updateCartItem,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  get_d_Cart,
  add_d_CartItem,
  remove_d_CartItem,
  updateCart_d_ItemQuantity,
  clear_d_Cart,
} = require("../controllers/ecomCartController");
const {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  toggleWishlist,
} = require("../controllers/ecomWishlistController");
const {
  getReviews,
  addReview,
} = require("../controllers/ecomReviewController");
const {
  createPayment,
  getPayments,
  updatePaymentStatus,
} = require("../controllers/ecomPaymentController");
const authMiddleware = require("../middleware/authMiddleware");

// Auth Routes (public)
router.post("/auth/register", register);
router.post("/auth/login", login);
router.get("/auth/me", ecomAuth, authMe);

// Profile & Addresses (auth)
router.get("/profile", ecomAuth, getProfile);
router.put("/profile", ecomAuth, updateProfile);

router.get("/addresses", ecomAuth, getAddresses);
router.post("/addresses", ecomAuth, addAddress);
router.put("/addresses/:id", ecomAuth, updateAddress);
router.delete("/addresses/:id", ecomAuth, deleteAddress);
router.put("/addresses/:id/default", ecomAuth, setDefaultAddress);

// for distributor
router.get("/d_addresses", authMiddleware, getAddresses);
router.post("/d_addresses", authMiddleware, addAddress);
// Cart (auth)
router.get("/cart", ecomAuth, getCart);
router.post("/cart/items", ecomAuth, addCartItem);
router.put("/cart/items", ecomAuth, updateCartItem);
router.delete("/cart/items/:item_id", ecomAuth, removeCartItem);
router.put("/cart/items/:id/updateQuantity", ecomAuth, updateCartItemQuantity);
router.delete("/cart/clear", ecomAuth, clearCart);

// Distributor cart
router.get("/d_cart", authMiddleware, get_d_Cart);
router.post("/cart/d_items", authMiddleware, add_d_CartItem);
router.put(
  "/cart/d_items/:id/updateQuantity",
  authMiddleware,
  updateCart_d_ItemQuantity,
);
router.delete("/cart/d_items/:item_id", authMiddleware, remove_d_CartItem);
router.delete("/cart/d_clear", authMiddleware, clear_d_Cart);

// Wishlist (auth)
router.get("/wishlist", ecomAuth, getWishlist);
router.post("/wishlist", ecomAuth, addToWishlist);
router.delete("/wishlist/:product_id", ecomAuth, removeFromWishlist);
router.post("/wishlist/toggle", ecomAuth, toggleWishlist);

// Reviews
router.get("/reviews/:product_id", getReviews);
router.post("/reviews", ecomAuth, addReview);

// Payments (auth)
router.post("/payments", ecomAuth, createPayment);
router.get("/payments", ecomAuth, getPayments);
router.put(
  "/payments/:payment_id",
  [ecomAuth, ecomIsAdmin],
  updatePaymentStatus,
);

module.exports = router;
