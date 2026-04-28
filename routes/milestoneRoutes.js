const express = require("express");
const router = express.Router();
const {
  getMilestones,
  getMilestoneById,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} = require("../controllers/milestoneController");

const authMiddleware = require("../middleware/authMiddleware");
const isSuperAdmin = require("../middleware/isSuperAdmin");

// Public read access
router.get("/", getMilestones);
router.get("/:id", getMilestoneById);

// Admin CRUD - protected
router.post("/", [authMiddleware, isSuperAdmin], createMilestone);
router.put("/:id", [authMiddleware, isSuperAdmin], updateMilestone);
router.delete("/:id", [authMiddleware, isSuperAdmin], deleteMilestone);

module.exports = router;
