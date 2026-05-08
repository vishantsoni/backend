const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const isAdminOrSuperAdmin = require("../middleware/isAdminOrSuperAdmin");

const {
  listSampleRequests,
  getSampleRequestById,
  createSampleRequest,
  updateSampleRequest,
} = require("../controllers/sampleRequestController");

// Admin/SuperAdmin: list + get-by-id
router.get("/", [authMiddleware, isAdminOrSuperAdmin], listSampleRequests);
router.get("/:id", [authMiddleware, isAdminOrSuperAdmin], getSampleRequestById);

// Admin/SuperAdmin: create + update
router.post("/", createSampleRequest);
router.put("/:id", [authMiddleware, isAdminOrSuperAdmin], updateSampleRequest);

module.exports = router;
