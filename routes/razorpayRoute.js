const express = require("express");
const {
  createOrder,
  verifyPayment,
  razorpayWebhook,
} = require("../controllers/razorPayController");
const router = express.Router();

router.post("/create-order", createOrder);
router.post("/verify", verifyPayment);
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  razorpayWebhook,
);
module.exports = router;
