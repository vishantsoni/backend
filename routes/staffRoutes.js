const express = require("express");
const router = express.Router();
const staffController = require("../controllers/staffController");
const auth = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const isSuperAdmin = require("../middleware/isSuperAdmin");

// GET /api/staff
router.get("/", [auth, isSuperAdmin], staffController.getAllStaff);

// GET /api/staff/:id
router.get("/:id", [auth, isAdmin], staffController.getStaffById);

// POST /api/staff
router.post("/", [auth, isSuperAdmin], staffController.createStaff);

// PUT /api/staff/:id
router.put("/:id", [auth, isSuperAdmin], staffController.updateStaff);

// DELETE /api/staff/:id (deactivate)
router.delete("/:id", [auth, isSuperAdmin], staffController.deleteStaff);

module.exports = router;
