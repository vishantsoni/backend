const express = require("express");
const router = express.Router();
const rolesController = require("../controllers/rolesController");
const auth = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin"); // or isSuperAdmin
const isSuperAdmin = require("../middleware/isSuperAdmin");

// GET /api/roles
router.get("/", [auth], rolesController.getAllRoles);

// POST /api/roles
router.post("/", [auth, isSuperAdmin], rolesController.createRole);

// PUT /api/roles/:id
router.put("/:id", [auth, isSuperAdmin], rolesController.updateRole);

// DELETE /api/roles/:id
router.delete("/:id", [auth, isSuperAdmin], rolesController.deleteRole);

// GET /api/roles/:id/permissions (for frontend checks)
router.get("/:id/permissions", auth, rolesController.getRolePermissions);

module.exports = router;
