const express = require("express");
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/authMiddleware');

// Wallet routes
router.get('/balance', authMiddleware, walletController.getBalance);
router.get('/history', authMiddleware, walletController.getHistory);

module.exports = router;
