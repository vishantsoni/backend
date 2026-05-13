const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const isAdminOrSuperAdmin = require("../middleware/isAdminOrSuperAdmin");

const { getTopAnalytics } = require("../controllers/analyticsController");

// @route   GET /api/analytics/top
// @desc    Get top analytics lists (Top selling product, Top distributor, Top ecom user)
// @access  Admin/SuperAdmin
router.get("/top", authMiddleware, isAdminOrSuperAdmin, getTopAnalytics);

module.exports = router;
