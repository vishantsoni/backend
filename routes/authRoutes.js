const express = require("express");
const router = express.Router();
const {
  register,
  login,
  sendLoginOtp,
} = require("../controllers/authController");

// @route   POST api/auth/register
router.post("/register", register);
router.post("/login", login);
router.post("/send-login-otp", sendLoginOtp);

module.exports = router;
