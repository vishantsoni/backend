const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const {
  getMyInventory,
  getDistributorInventory,
  adjustStock,
} = require("../controllers/inventoryController");

// Distributor: Get my inventory
router.get("/my", authMiddleware, getMyInventory);

// Admin: Get specific distributor inventory
router.get(
  "/:distributor_id",
  [authMiddleware, isAdmin],
  getDistributorInventory,
);

// Distributor or Admin: Adjust stock manually
router.post("/adjust", authMiddleware, adjustStock);

module.exports = router;
