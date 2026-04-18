const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { placePO, getPlans } = require("../controllers/purchaseController");
const router = express.Router();

router.get("/", getPlans);
router.post("/place-po", authMiddleware, placePO);

module.exports = router;
