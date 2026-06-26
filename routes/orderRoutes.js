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

const orderReturnController = require("../controllers/orderReturnController");

const ecomAuth = require("../middleware/ecomAuth");
const {
  d_p_o,
  getAllD_Orders,
  getPlacedOrder,
  getRecievedOrder,
} = require("../controllers/distributor_OrderController");

router.post("/", ecomAuth, placeOrder); // User place order
router.get("/my", ecomAuth, getMyOrders); // My orders

router.get("/", [authMiddleware, isSuperAdmin], getAllOrders); // Admin all
router.get("/details/:id", getOrderDetail); // Detail (admin/user own)
router.put("/:id/status", [authMiddleware], updateOrderStatus);
router.delete("/:id", [authMiddleware, isSuperAdmin], cancelOrder);

// -------- Order Return Flow --------
// Customer/distributor creates return request (allowed only when order is delivered)
router.post(
  "/:id/return-request",
  ecomAuth,
  orderReturnController.requestReturn,
);

router.post(
  "/return/:id/request",
  authMiddleware,
  orderReturnController.dis_requestReturn,
);

// Admin approves / rejects return request
router.put(
  "/returns/:returnId/approve",
  [authMiddleware, isSuperAdmin],
  orderReturnController.adminApproveReturn,
);
router.put(
  "/returns/:returnId/reject",
  [authMiddleware, isSuperAdmin],
  orderReturnController.adminRejectReturn,
);

// Warehouse confirms receipt (inventory restored here)
router.post(
  "/returns/:returnId/receive",
  [authMiddleware, isSuperAdmin],
  orderReturnController.warehouseReceiveReturn,
);

// Admin/refund wallet after received
router.post(
  "/returns/:returnId/refund",
  [authMiddleware, isSuperAdmin],
  orderReturnController.refundForReturn,
);

// distributor place order
router.post("/d_p_o", authMiddleware, d_p_o); // User place order
router.post("/getAllD_P_O", [authMiddleware, isSuperAdmin], getAllD_Orders); // User place order

router.get("/placed", [authMiddleware], getPlacedOrder); // User place order
router.get("/received", [authMiddleware], getRecievedOrder); // User place order

module.exports = router;
