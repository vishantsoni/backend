const express = require("express");
const router = express.Router();
const { getDashboardData } = require("../controllers/dashboardController");
const authMiddleware = require("../middleware/authMiddleware");
const isAdminOrSuperAdmin = require("../middleware/isAdminOrSuperAdmin");

// @route   GET api/dashboard
// @desc    Get admin dashboard overview data
// @access  Admin/SuperAdmin
router.get("/", authMiddleware, isAdminOrSuperAdmin, getDashboardData);

module.exports = router;
