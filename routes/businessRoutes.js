const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const incomeSimulatorController = require("../controllers/incomeSimulatorController");

// Income Simulator (protected)
router.post(
  "/income-simulator",
  [authMiddleware],
  incomeSimulatorController.simulateIncome,
);

module.exports = router;
