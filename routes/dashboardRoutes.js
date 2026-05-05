const express = require("express");
const router = express.Router();
const {
  getDashboardData,
  getUserDashboardData,
  getAnalytics,
} = require("../controllers/dashboardController");
const authMiddleware = require("../middleware/authMiddleware");
const isAdminOrSuperAdmin = require("../middleware/isAdminOrSuperAdmin");

// @route   GET api/dashboard/me
// @desc    Get user/distributor personal dashboard data
// @access  Authenticated User/Distributor
router.get("/me", authMiddleware, getUserDashboardData);

// @route   GET api/dashboard
// @desc    Get admin dashboard overview data
// @access  Admin/SuperAdmin
router.get("/", authMiddleware, isAdminOrSuperAdmin, getDashboardData);

// @route   GET api/dashboard/analytics
// @desc    Get MLM analytics metrics (Total Referrals, Active Downline, Commissions, Conversion Rate)
// @access  Admin/SuperAdmin
router.get("/analytics", authMiddleware, getAnalytics);

module.exports = router;
