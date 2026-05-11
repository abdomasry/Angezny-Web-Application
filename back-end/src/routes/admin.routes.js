const express = require("express");
const router = express.Router();
const {
  getStats,
  getUsers,
  getUserById,
  updateUserStatus,
  getVerificationRequests,
  handleVerification,
  getReports,
  updateReport,
  getOrders,
  updateOrderStatus,
  getPendingServices,
  approveService,
  rejectService,
  getLicenses,
  approveLicense,
  rejectLicense,
} = require("../controllers/admin.controller");
const {
  listAllTickets,
  updateStatus: updateTicketStatus,
} = require("../controllers/support.controller");
const authMiddleware = require("../middleware/auth.middleware");
const adminOnly = require("../middleware/admin.middleware");

// All admin routes require: authMiddleware (verify token) → adminOnly (check role)
router.get("/stats", authMiddleware, adminOnly, getStats);
router.get("/users", authMiddleware, adminOnly, getUsers);
router.get("/users/:id", authMiddleware, adminOnly, getUserById);
router.put("/users/:id/status", authMiddleware, adminOnly, updateUserStatus);
router.get("/verification-requests", authMiddleware, adminOnly, getVerificationRequests);
router.put("/verification/:id", authMiddleware, adminOnly, handleVerification);
router.get("/reports", authMiddleware, adminOnly, getReports);
router.put("/reports/:id", authMiddleware, adminOnly, updateReport);
router.get("/orders", authMiddleware, adminOnly, getOrders);
router.put("/orders/:id/status", authMiddleware, adminOnly, updateOrderStatus);
router.get("/pending-services", authMiddleware, adminOnly, getPendingServices);
router.put("/services/:id/approve", authMiddleware, adminOnly, approveService);
router.put("/services/:id/reject", authMiddleware, adminOnly, rejectService);

// License review queue (multi-license / training certs).
// One row per LICENSE entry — see admin.controller.getLicenses for the shape.
router.get("/licenses", authMiddleware, adminOnly, getLicenses);
router.put("/licenses/:licenseId/approve", authMiddleware, adminOnly, approveLicense);
router.put("/licenses/:licenseId/reject", authMiddleware, adminOnly, rejectLicense);

// Support tickets — admin list + status management. The user-side endpoints
// (create / view / reply) live in support.routes.js at /api/support.
router.get("/tickets", authMiddleware, adminOnly, listAllTickets);
router.put("/tickets/:id/status", authMiddleware, adminOnly, updateTicketStatus);

module.exports = router;
