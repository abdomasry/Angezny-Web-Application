const mongoose = require('mongoose');

// ============================================================
// Review model — supports BOTH directions of review
// ============================================================
//   direction = "customer_to_worker"  (legacy + default for old docs)
//   direction = "worker_to_customer"  (new — workers rating customers)
// ============================================================
const reviewSchema = new mongoose.Schema(
  {
    serviceRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceRequest",
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    comment: String,
    direction: {
      type: String,
      enum: ["customer_to_worker", "worker_to_customer"],
      // No default — controllers always set it explicitly. The backfill script
      // assigns "customer_to_worker" to every old doc that lacks the field.
    },
  },
  { timestamps: true }
);

// Listing reviews about a worker (for the worker public profile).
reviewSchema.index({ workerId: 1, direction: 1, createdAt: -1 });
// Listing reviews about a customer (for the worker-only customer profile).
reviewSchema.index({ customerId: 1, direction: 1, createdAt: -1 });

module.exports = mongoose.model("Review", reviewSchema);
