const mongoose = require("mongoose");

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
    transactionId: String,
    paidAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Payment", paymentSchema);