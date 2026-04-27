const express = require("express");
const router = express.Router();
const {
  listNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
} = require("../controllers/notificationController");

const authMiddleware = require("../middleware/authMiddleware");
const isAdminOrSuperAdmin = require("../middleware/isAdminOrSuperAdmin");

// Public read access
router.get("/", listNotifications);
router.get("/:id", getNotificationById);

// Admin/SuperAdmin CRUD - protected
router.post("/", [authMiddleware, isAdminOrSuperAdmin], createNotification);
router.put("/:id", [authMiddleware, isAdminOrSuperAdmin], updateNotification);
router.delete(
  "/:id",
  [authMiddleware, isAdminOrSuperAdmin],
  deleteNotification,
);

module.exports = router;
