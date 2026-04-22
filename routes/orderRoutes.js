const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const isSuperAdmin = require("../middleware/isSuperAdmin");
const {
  placeOrder,
  getMyOrders,
  getAllOrders,
  getOrderDetail,
  updateOrderStatus,
  cancelOrder,
} = require("../controllers/orderController");
const ecomAuth = require("../middleware/ecomAuth");
const {
  d_p_o,
  getAllD_Orders,
} = require("../controllers/distributor_OrderController");

router.post("/", ecomAuth, placeOrder); // User place order
router.get("/my", ecomAuth, getMyOrders); // My orders

router.get("/", [authMiddleware, isSuperAdmin], getAllOrders); // Admin all
router.get("/details/:id", getOrderDetail); // Detail (admin/user own)
router.put("/:id/status", [authMiddleware, isSuperAdmin], updateOrderStatus);
router.delete("/:id", [authMiddleware, isSuperAdmin], cancelOrder);

// distributor place order
router.post("/d_p_o", authMiddleware, d_p_o); // User place order
router.post("/getAllD_P_O", [authMiddleware, isSuperAdmin], getAllD_Orders); // User place order

module.exports = router;
