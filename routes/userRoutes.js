const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const auth = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const isSuperAdmin = require("../middleware/isSuperAdmin");
const kycMiddleware = require("../middleware/kycMiddleware");
const { getKycRequests, updateKycRequest } = require("../controllers/kycRequestController");

router.get("/downline", auth, userController.getMyDownline);
router.get("/tree", auth, userController.getMyTree);

router.post("/create", userController.createUser);
router.get("/profile-by-referral", userController.getProfile);

// Transaction PIN & Password
router.post("/set-pin", auth, userController.setTransactionPin);
router.post("/change-password", auth, userController.changePassword);

// KYC routes
router.get("/kyc-status", kycMiddleware, userController.getKycStatus);
router.post("/kyc/upload",  require("../middleware/processKycUpload"), userController.uploadKycDocuments);
router.post("/kyc/submit", kycMiddleware, userController.submitKycRequest);
router.post("/admin/kyc/:userId", [auth, isAdmin], userController.updateKycStatus);
router.get("/admin/kyc-requests", [kycMiddleware, isSuperAdmin], getKycRequests);
router.put("/admin/kyc-requests/:id", [kycMiddleware, isSuperAdmin], updateKycRequest);
router.put('/kyc/doc-update/:docId', [kycMiddleware, isSuperAdmin], userController.updateKycDocument);


module.exports = router;
