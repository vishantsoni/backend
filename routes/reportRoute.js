const express = require("express");
const router = express.Router();
const {
  getSalesReport,
  getDistributorSalesReport,
  getProfitLossReport,
  getPurchaseReport,
  getGSTReport,
  exportGSTReportExcel,
  exportSalesReportExcel,
} = require("../controllers/reportsController");
const authMiddleware = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const isSuperAdmin = require("../middleware/isSuperAdmin");

// @route   GET api/reports/sales
router.get("/sales", authMiddleware, isSuperAdmin, getSalesReport);

// @route   GET api/reports/distributor-sales
router.get("/distributor-sales", authMiddleware, getDistributorSalesReport);

// @route   GET api/reports/sales-excel
router.get(
  "/sales-excel",
  authMiddleware,
  isSuperAdmin,
  exportSalesReportExcel,
);

// @route   GET api/reports/profit-loss
router.get("/profit-loss", authMiddleware, isSuperAdmin, getProfitLossReport);

// @route   GET api/reports/purchase
router.get("/purchase", authMiddleware, isAdmin, getPurchaseReport);

// @route   GET api/reports/gst
router.get("/gst", authMiddleware, getGSTReport);
router.get("/gst-excel", exportGSTReportExcel);

module.exports = router;
