const express = require("express");
const router = express.Router();
const {
  getSettings,
  getSettingByKey,
  createSetting,
  updateSetting,
  deleteSetting,
  getLevelCommissions,
  getLevelCommission,
  createLevelCommission,
  updateLevelCommission,
  deleteLevelCommission,
  getLevelCapping,
  createLevelCapping,
  deleteLevelCapping,
  updateLevelCapping,
} = require("../controllers/settingsController");

const authMiddleware = require("../middleware/authMiddleware");
const isSuperAdmin = require("../middleware/isSuperAdmin");

// Public read access
router.get("/", getSettings);
router.get("/:key", getSettingByKey);
router.get("/category/:category", getSettings);

// Admin CRUD - protected
router.post("/", [authMiddleware, isSuperAdmin], createSetting);
router.put("/:key", [authMiddleware, isSuperAdmin], updateSetting);
router.delete("/:key", [authMiddleware, isSuperAdmin], deleteSetting);

// Level Commissions routes
router.get("/commissions/list", getLevelCommissions);
router.get("/level-commissions-by-no/:level_no", getLevelCommission);

router.post(
  "/level-commissions",
  [authMiddleware, isSuperAdmin],
  createLevelCommission,
);
router.put(
  "/level-commissions/:level_id",
  [authMiddleware, isSuperAdmin],
  updateLevelCommission,
);
router.delete(
  "/level-commissions/:level_no",
  [authMiddleware, isSuperAdmin],
  deleteLevelCommission,
);

// Level capping
router.get("/capping/list", getLevelCapping);
router.post(
  "/level-capping",
  [authMiddleware, isSuperAdmin],
  createLevelCapping,
);
router.put(
  "/level-capping/:level_no",
  [authMiddleware, isSuperAdmin],
  updateLevelCapping,
);
router.delete(
  "/level-capping/:id",
  [authMiddleware, isSuperAdmin],
  deleteLevelCapping,
);

module.exports = router;
