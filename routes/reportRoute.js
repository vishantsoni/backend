const express = require("express");
const router = express.Router();
const {
  getSalesReport,
  getProfitLossReport,
  getPurchaseReport,
} = require("../controllers/reportsController");
const authMiddleware = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const isSuperAdmin = require("../middleware/isSuperAdmin");

// @route   GET api/reports/sales
router.get("/sales", authMiddleware, isSuperAdmin, getSalesReport);

// @route   GET api/reports/profit-loss
router.get("/profit-loss", authMiddleware, isSuperAdmin, getProfitLossReport);

// @route   GET api/reports/purchase
router.get("/purchase", authMiddleware, isAdmin, getPurchaseReport);

module.exports = router;
