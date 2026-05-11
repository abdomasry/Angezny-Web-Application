// ============================================================
// Order Routes
// ============================================================
// Two endpoints live here:
//   - POST /api/customer/orders — customer creates a new service order.
//   - PUT  /api/worker/orders/:id/status — worker accepts/rejects/progresses
//     one of their orders.
//
// Both paths share the /api/customer + /api/worker mount points that the
// existing customer/worker-dashboard routes use. They're split into this
// separate file because order lifecycle logic is its own concern.
// ============================================================

const express = require("express");
const router = express.Router();

const {
  createOrder,
  updateOrderStatusByWorker,
  cancelOrderByCustomer,
  respondToCancellationByWorker,
} = require("../controllers/order.controller");
const authMiddleware = require("../middleware/auth.middleware");
const workerOnly = require("../middleware/worker.middleware");

// Mounted at /api. Full paths:
//   POST /api/customer/orders
//   POST /api/customer/orders/:id/cancel
//   PUT  /api/worker/orders/:id/status
//   PUT  /api/worker/orders/:id/cancellation
router.post("/customer/orders", authMiddleware, createOrder);
router.post("/customer/orders/:id/cancel", authMiddleware, cancelOrderByCustomer);
router.put(
  "/worker/orders/:id/status",
  authMiddleware,
  workerOnly,
  updateOrderStatusByWorker,
);
router.put(
  "/worker/orders/:id/cancellation",
  authMiddleware,
  workerOnly,
  respondToCancellationByWorker,
);

module.exports = router;
