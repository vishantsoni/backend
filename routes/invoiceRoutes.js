const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { generateInvoice } = require("../controllers/invoiceController");

const router = express.Router();

// Generate (or reuse) invoice PDF
// POST /api/invoice/generate?force=true|false
// body: { invoiceNo?: string, invoiceDate?: string }
router.post("/generate", authMiddleware, generateInvoice);

module.exports = router;
