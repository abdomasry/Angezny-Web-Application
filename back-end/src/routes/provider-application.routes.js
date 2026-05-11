const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const adminOnly = require("../middleware/admin.middleware");
const {
  submitApplication,
  getMyApplication,
  listApplications,
  approveApplication,
  rejectApplication,
} = require("../controllers/provider-application.controller");

// Customer-side routes — auth required, role check inside controller
router.post("/", authMiddleware, submitApplication);
router.get("/me", authMiddleware, getMyApplication);

// Admin-only routes
router.get("/", authMiddleware, adminOnly, listApplications);
router.put("/:id/approve", authMiddleware, adminOnly, approveApplication);
router.put("/:id/reject", authMiddleware, adminOnly, rejectApplication);

module.exports = router;
