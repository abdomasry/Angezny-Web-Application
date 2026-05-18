const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const workerOnly = require("../middleware/worker.middleware");
const {
  setPayoutInfo,
  getPayoutInfo,
  requestWithdrawal,
  handlePayoutWebhook,
  listWithdrawals,
} = require("../controllers/payout.controller");

// ============================================================
// Worker payouts (Paymob)
// ============================================================
// All worker-side routes require auth + worker role. The Paymob webhook is
// public and HMAC-verified inside the handler.
// ============================================================

router.get("/info", authMiddleware, workerOnly, getPayoutInfo);
router.post("/info", authMiddleware, workerOnly, setPayoutInfo);

router.post("/withdraw", authMiddleware, workerOnly, requestWithdrawal);
router.get("/withdrawals", authMiddleware, workerOnly, listWithdrawals);

// Public — Paymob calls this. HMAC check is inside the controller.
router.post("/webhook", handlePayoutWebhook);

module.exports = router;
