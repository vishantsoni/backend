const express = require("express");
const router = express.Router();
const transactionController = require("../controllers/transactionController");
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
// const kycMiddleware = require("../middleware/kycMiddleware"); // unused

const isSuperAdmin = require("../middleware/isSuperAdmin");

// Transaction PIN & OTP
router.post("/verify-pin", authMiddleware, transactionController.verifyPin);
router.post("/send-otp", authMiddleware, transactionController.sendOTP);
router.post("/verify-otp", authMiddleware, transactionController.verifyOTP);

// User setup
router.post("/set-pin", authMiddleware, userController.setTransactionPin);
router.post("/change-password", authMiddleware, userController.changePassword);

// Main transactions (call verify-pin/otp client-side first or add middleware)
router.post("/transfer", authMiddleware, transactionController.transferToUser);
router.post(
  "/add-transaction",
  [authMiddleware, isSuperAdmin],
  transactionController.addTransaction,
);
router.post("/withdraw", authMiddleware, transactionController.withdraw);

// Super Admin: All transactions
router.get(
  "/transactions",
  authMiddleware,
  isSuperAdmin,
  transactionController.listAllTransactionsForSuperAdmin,
);

// Super Admin: Withdraw requests workflow
router.get(
  "/withdraw-requests",
  authMiddleware,
  isSuperAdmin,
  transactionController.listWithdrawRequests,
);

router.post(
  "/withdraw-requests/:id/approve",
  authMiddleware,
  isSuperAdmin,
  transactionController.approveWithdrawRequest,
);
router.post(
  "/withdraw-requests/:id/reject",
  authMiddleware,
  isSuperAdmin,
  transactionController.rejectWithdrawRequest,
);

module.exports = router;
