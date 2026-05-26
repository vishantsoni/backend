const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const ecomAuth = require("../middleware/ecomAuth");
const { chatbotMessage } = require("../controllers/chatbotController");
const orAuth = require("../middleware/orAuth");

// Unified chatbot endpoint for both Distributor (users) and E-commerce user (ecom_user).
// You MUST ensure auth middleware sets req.user.role and req.user.id in a compatible way.
router.post("/message", orAuth, chatbotMessage);

module.exports = router;
