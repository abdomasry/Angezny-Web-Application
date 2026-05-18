const mongoose = require('mongoose');
const serviceRequestSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerServices",
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    initiatedBy: {
      type: String,
      enum: ["customer", "worker"],
      default: "customer",
    },
    customTitle: { type: String, default: null },
    customPrice: { type: Number, default: null },
    paymentTiming: {
      type: String,
      enum: ["before", "after"],
      default: "before",
    },
    description: String,
    // Up to 5 Cloudinary URLs uploaded by the customer at order creation
    // to illustrate the problem (broken pipe, cracked tile, etc.). Same
    // storage pattern as completionReport.images — strings only, no metadata.
    problemImages: {
      type: [{ type: String }],
      validate: [
        (arr) => Array.isArray(arr) && arr.length <= 5,
        "Maximum 5 problem images allowed",
      ],
      default: [],
    },
    location: {
      address: String,
      governorate: String,
      city: String,
      lat: Number,
      lng: Number,
    },
    proposedPrice: Number,
    paymentMode: {
      type: String,
      enum: ["cash_on_delivery", "card"],
      default: "cash_on_delivery",
    },
    couponCode: {
      type: String,
      default: null,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    // Completion proof uploaded by the worker when flipping the order to
    completionReport: {
      details: { type: String, default: "" },
      images: [{ type: String }], // Cloudinary URLs (same pipeline as chat attachments)
      submittedAt: { type: Date },
    },
    // Cancellation request raised by the customer on an already-accepted
    cancellationRequest: {
      requestedBy: { type: String, enum: ["customer", "worker"] },
      reason: { type: String, default: "" },
      status: {
        type: String,
        enum: ["pending", "approved", "denied"],
      },
      requestedAt: { type: Date },
      respondedAt: { type: Date },
      denialReason: { type: String, default: "" },
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "pending_customer_confirmation",
        "accepted",
        "rejected",
        "in_progress",
        "completed",
        "cancelled",
      ],
      default: "pending",
    },
    scheduledDate: Date,
    completedAt: Date,
    cancelledBy: {
      type: String,
      enum: ["customer", "worker", "admin"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ServiceRequest", serviceRequestSchema);