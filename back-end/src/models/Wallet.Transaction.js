const mongoose = require("mongoose");

// ============================================================
// WalletTransaction


const walletTransactionSchema = new mongoose.Schema(
  {
    // References User._id (same shape as ServiceRequest.workerId). Indexed
    // so the wallet view can page through a worker's history quickly.
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    // Stored as a positive integer (EGP). We NEVER store negative numbers —
    // `type` alone indicates direction. Keeps aggregations unambiguous.
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      enum: ["order_completion", "withdrawal", "adjustment"],
      required: true,
    },
    relatedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceRequest",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "completed",
    },
    // Short human-readable description shown in the wallet UI. Example:
    // "دفعة مقابل: Full Clean".
    note: { type: String, default: "" },
    // ─── Withdrawal-only fields ──────────────────────────────────
    // Populated when source === "withdrawal". Paymob's payout transaction id
    // is returned from the Payouts API call (sandbox or live) — we store it
    // so the payout webhook can flip the right doc to completed/failed.
    paymobPayoutId: String,
    // Snapshot of where the money was sent (bank / instapay / wallet) at the
    // time of withdrawal. Kept on the transaction itself so it survives even
    // if the worker later changes their default payout method.
    payoutMethod: {
      type: String,
      enum: ["bank", "instapay", "wallet"],
    },
    // Human-readable failure reason captured from a failed Paymob payout —
    // shown in the worker's withdrawal history.
    failureReason: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
