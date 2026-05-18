const mongoose = require("mongoose");

// ============================================================
// Payment
// ============================================================
// One Payment doc represents a single attempt to take money from a customer
// for one ServiceRequest. A failed attempt stays in the DB (status="failed")
// and the customer can create a new Payment doc to retry — that way we keep
// a full audit trail of what Paymob saw and when.
// ============================================================
const paymentSchema = new mongoose.Schema(
  {
    serviceRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceRequest",
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerProfile",
    },
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
    },
    amount: Number,
    platformFee: Number,
    workerEarnings: Number,
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    // Paymob's "order id" — different from our ServiceRequest id. Returned in
    // the Intention API response. We store it so webhook reconciliation can
    // look up the right Payment doc when only the Paymob order id is known.
    paymobOrderId: String,
    // Paymob's Intention API resource id — what the hosted checkout binds to.
    paymobIntentionId: String,
    // Which method the customer actually used at the gateway. Filled in by
    // the webhook (Paymob tells us in the callback). For now we only enable
    // "card" — wallet/instapay land once we have those integration IDs.
    paymentMethod: {
      type: String,
      enum: ["card", "wallet", "instapay"],
    },
    // Transaction id Paymob assigns to the successful charge. Useful for
    // refunds and customer-support tracing.
    transactionId: String,
    // Human-readable failure reason captured from a failed webhook so the
    // checkout result page can show the customer something useful.
    failureReason: String,
    paidAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Payment", paymentSchema);
