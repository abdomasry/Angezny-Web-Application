const express = require("express");
const router = express.Router();
const {
  signup,
  signin,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerificationCode,
  getMe,
  getNotifications,
  markNotificationsRead,
  googleSignin,
  facebookSignin,
} = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");
const {
  authLimiter,
  emailFloodLimiter,
} = require("../middleware/rate-limit.middleware");

// Public routes (no token needed). Rate limiters are applied per-endpoint:
router.post("/signup", authLimiter, signup);
router.post("/signin", authLimiter, signin);
// OAuth — same authLimiter to slow down replay attempts. Each request is
// already gated by provider-side token verification, so brute force is
// effectively impossible
router.post("/google", authLimiter, googleSignin);
router.post("/facebook", authLimiter, facebookSignin);
router.post("/forgot-password", emailFloodLimiter, forgotPassword);
// reset-password gets the same email-flood limiter — even though it doesn't
// send mail, an attacker brute-forcing reset tokens would otherwise have
// unlimited tries against the JWT secret.
router.post("/reset-password", emailFloodLimiter, resetPassword);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification-code", emailFloodLimiter, resendVerificationCode);

// Protected routes (token required)
// authMiddleware runs first, verifies the token, then getMe runs
router.get("/me", authMiddleware, getMe);
router.get("/notifications", authMiddleware, getNotifications);
router.put("/notifications/read-all", authMiddleware, markNotificationsRead);

module.exports = router;
