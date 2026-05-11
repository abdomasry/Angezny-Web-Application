const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const workerOnly = require("../middleware/worker.middleware");
const {
  getDashboard,
  updateProfile,
  getMyServices,
  addService,
  updateService,
  deleteService,
  getMyOrders,
  getWallet,
  addLicense,
  updateLicense,
  deleteLicense,
  toggleLicenseActive,
} = require("../controllers/worker-dashboard.controller");

// ============================================================
// Worker Dashboard Routes — all protected
// ============================================================

// Dashboard overview — profile + stats + earnings
router.get("/dashboard", authMiddleware, workerOnly, getDashboard);
router.put("/profile", authMiddleware, workerOnly, updateProfile);

// Service management (CRUD)
router.get("/services", authMiddleware, workerOnly, getMyServices);
router.post("/services", authMiddleware, workerOnly, addService);
router.put("/services/:serviceId", authMiddleware, workerOnly, updateService);
router.delete("/services/:serviceId", authMiddleware, workerOnly, deleteService);

// Orders — see requests from customers
router.get("/orders", authMiddleware, workerOnly, getMyOrders);

// Wallet — balance + lifetime earnings + transaction history
router.get("/wallet", authMiddleware, workerOnly, getWallet);

// Licenses — multi-credential flow (training, professional, etc.).
// Add = new entry in pending. Update = edit metadata or replace file. Delete
// = remove. PATCH active = enable/disable on public profile (approved only).
router.post("/licenses", authMiddleware, workerOnly, addLicense);
router.put("/licenses/:licenseId", authMiddleware, workerOnly, updateLicense);
router.delete("/licenses/:licenseId", authMiddleware, workerOnly, deleteLicense);
// PUT (not PATCH) so the frontend can use api.putWithAuth — there's no
// patchWithAuth helper in lib/api.ts, and a stylistic-only PATCH would have
// failed with an HTML 404 page that the JSON parser then tripped on.
router.put("/licenses/:licenseId/active", authMiddleware, workerOnly, toggleLicenseActive);

module.exports = router;
