const express = require("express");
const router = express.Router();

// Import all 6 controller functions
const {
  getPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  setDefaultPaymentMethod,
  getNotificationPreferences,
  updateNotificationPreferences,
} = require("../controllers/customer-settings.controller");

// Import the auth middleware — every route here requires login
const authMiddleware = require("../middleware/auth.middleware");

// ============================================================
// Payment Methods Routes
// ============================================================
router.get("/payment-methods", authMiddleware, getPaymentMethods);
router.post("/payment-methods", authMiddleware, addPaymentMethod);
router.delete("/payment-methods/:id", authMiddleware, deletePaymentMethod);
router.put("/payment-methods/:id/default", authMiddleware, setDefaultPaymentMethod);

// ============================================================
// Notification Preferences Routes
// ============================================================
router.get("/notifications/preferences", authMiddleware, getNotificationPreferences);
router.put("/notifications/preferences", authMiddleware, updateNotificationPreferences);

module.exports = router;
