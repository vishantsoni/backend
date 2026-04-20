const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const isSuperAdmin = require("../middleware/isSuperAdmin");
const {
  placePO,
  getPlans,
  getPlanDetail,
  getDistributorAdmin,
} = require("../controllers/purchaseController");
const router = express.Router();

router.get("/", getPlans);
router.post("/place-po", authMiddleware, placePO);
router.get("/detail/:id", authMiddleware, getPlanDetail);

router.get(
  "/distributor-orders",
  [authMiddleware, isSuperAdmin],
  getDistributorAdmin,
);

module.exports = router;
