const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  createCheckout,
  handleWebhook,
  getStatus,
} = require("../controllers/payment.controller");

// ============================================================
// Payments — Paymob pay-in
// ============================================================
// /api/payments/checkout      — start a hosted checkout (auth)
// /api/payments/webhook       — Paymob server-to-server callback (public,
//                               HMAC-verified inside the handler)
// /api/payments/:id/status    — poll for latest state from the result page
// ============================================================

router.post("/checkout", authMiddleware, createCheckout);

// IMPORTANT: webhook is public. Auth would block Paymob's servers.
// The handler verifies the HMAC signature before trusting any field.
router.post("/webhook", handleWebhook);

router.get("/:paymentId/status", authMiddleware, getStatus);

module.exports = router;
