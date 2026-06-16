const express = require("express");
const multer = require("multer");

const authMiddleware = require("../middleware/authMiddleware");
const isSuperAdmin = require("../middleware/isSuperAdmin");

const {
  uploadPolicy,
  listPolicies,
  getPolicyById,
  updatePolicy,
  deletePolicy,
  getActivePoliciesForDistributor,
} = require("../controllers/policiesController");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

// ====== Super Admin CRUD ======
router.post(
  "/",
  authMiddleware,
  isSuperAdmin,
  upload.single("pdf"),
  uploadPolicy,
);

router.get("/", authMiddleware, isSuperAdmin, listPolicies);

router.get("/:id", authMiddleware, isSuperAdmin, getPolicyById);

router.put(
  "/:id",
  authMiddleware,
  isSuperAdmin,
  upload.single("pdf"),
  updatePolicy,
);

router.delete("/:id", authMiddleware, isSuperAdmin, deletePolicy);

// ====== Distributor Panel (read-only) ======
// Keep this protected via auth; distributors will use authMiddleware.
// We filter to only active policies.
router.get("/active", authMiddleware, getActivePoliciesForDistributor);

module.exports = router;
