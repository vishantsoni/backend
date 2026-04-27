const express = require("express");
const router = express.Router();
const {
  getTax,
  getTaxById,
  createTax,
  updateTax,
  deleteTax,
} = require("../controllers/taxController");
const authMiddleware = require("../middleware/authMiddleware");
const isSuperAdmin = require("../middleware/isSuperAdmin");
// tax routes
router.get("/", [authMiddleware, isSuperAdmin], getTax);
router.get("/:id", [authMiddleware, isSuperAdmin], getTaxById);
router.post("/", [authMiddleware, isSuperAdmin], createTax);
router.put("/:id", [authMiddleware, isSuperAdmin], updateTax);
router.delete("/:id", [authMiddleware, isSuperAdmin], deleteTax);

module.exports = router;
