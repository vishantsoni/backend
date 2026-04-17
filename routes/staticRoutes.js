const express = require("express");
const {
  getBanners,
  addBanner,
  deleteBanner,
  getStaticData,
  createStaticData,
  updateStaticData,
  getAllStaticData,
} = require("../controllers/bannerController");
const authMiddleware = require("../middleware/authMiddleware");
const isSuperAdmin = require("../middleware/isSuperAdmin");
const {
  getTeamMembers,
  createTeam,
  deleteMember,
  updateMember,
} = require("../controllers/teamController");
const StateCityController = require("../controllers/stateCityController");
const router = express.Router();

// banner routes
router.get("/banner", getBanners);
router.post("/banner", [authMiddleware, isSuperAdmin], addBanner);
router.delete("/banner/:id", [authMiddleware, isSuperAdmin], deleteBanner);

// static content routes
router.get("/static/", getAllStaticData);
router.get("/static/:slug", getStaticData);
router.post("/static", [authMiddleware, isSuperAdmin], createStaticData);
router.put("/static/:slug", [authMiddleware, isSuperAdmin], updateStaticData);

// team members
router.get("/teamMember", getTeamMembers);
router.post("/teamMember", [authMiddleware, isSuperAdmin], createTeam);
router.put("/teamMember/:id", [authMiddleware, isSuperAdmin], updateMember);
router.delete("/teamMember/:id", [authMiddleware, isSuperAdmin], deleteMember);

// ===== STATE & CITY ROUTES =====
// Public
router.get("/states", StateCityController.getActiveStates);
router.get("/cities/:stateId", StateCityController.getActiveCitiesByState);

// Admin CRUD - States
router.post("/admin/states", [authMiddleware, isSuperAdmin], StateCityController.createState);
router.get("/admin/states", [authMiddleware, isSuperAdmin], StateCityController.getAllStates);
router.put("/admin/states/:id", [authMiddleware, isSuperAdmin], StateCityController.updateState);
router.delete("/admin/states/:id", [authMiddleware, isSuperAdmin], StateCityController.deleteState);

// Admin CRUD - Cities
router.post("/admin/cities", [authMiddleware, isSuperAdmin], StateCityController.createCity);
router.get("/admin/cities", [authMiddleware, isSuperAdmin], StateCityController.getAllCities);
router.put("/admin/cities/:id", [authMiddleware, isSuperAdmin], StateCityController.updateCity);
router.delete("/admin/cities/:id", [authMiddleware, isSuperAdmin], StateCityController.deleteCity);

module.exports = router;
