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
  },
  { timestamps: true },
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
