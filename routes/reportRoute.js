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

const {
  getTdsReport,
  exportTdsReportExcel,
} = require("../controllers/tdsReportController");

const {
  generateCommissionTdsBillPdf,
} = require("../controllers/commissionTdsBillController");

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
router.get("/gst-excel", authMiddleware, exportGSTReportExcel);

// @route   GET api/reports/tds
router.get("/tds", authMiddleware, getTdsReport);

// @route   GET api/reports/tds-excel
router.get("/tds-excel", authMiddleware, exportTdsReportExcel);

// @route   POST api/reports/commission-tds/bill-pdf
// body/query: { from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', force?: 'true'|'false' }
// If from/to not provided, it generates for last month (UTC) cycle.
router.post(
  "/commission-tds/bill-pdf",
  authMiddleware,
  generateCommissionTdsBillPdf,
);

module.exports = router;
