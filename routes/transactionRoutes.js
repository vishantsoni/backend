const express = require("express");
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const kycMiddleware = require('../middleware/kycMiddleware'); // Assume exists or use in controller

// Transaction PIN & OTP
router.post('/verify-pin', authMiddleware, transactionController.verifyPin);
router.post('/send-otp', authMiddleware, transactionController.sendOTP);
router.post('/verify-otp', authMiddleware, transactionController.verifyOTP);

// User setup
router.post('/set-pin', authMiddleware, userController.setTransactionPin);
router.post('/change-password', authMiddleware, userController.changePassword);

// Main transactions (call verify-pin/otp client-side first or add middleware)
router.post('/transfer', authMiddleware,  transactionController.transferToUser);
router.post('/withdraw', authMiddleware,  transactionController.withdraw);

module.exports = router;
