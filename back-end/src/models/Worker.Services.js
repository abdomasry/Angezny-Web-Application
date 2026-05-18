const mongoose = require("mongoose");

const workerServicesSchema = new mongoose.Schema(
  {
    workerID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    name: {
      type: String,
      required: [true, "Service name is required"],
      trim: true,
    },
    description: String,
    images: [{ type: String }], // URLs of images showcasing the service
    price: Number,
    typeofService: {
      type: String,
      enum: ["hourly", "fixed", "range", "custom"],
      default: "fixed",
    },
    time: Date,
    priceRange: {
      min: { type: Number },
      max: { type: Number },
      custom: { type: String },
    },
    paymentTiming: {
      type: String,
      enum: ["before", "after"],
      default: "before",
    },
    isPrivate: { type: Boolean, default: false },
    active: { type: Boolean, default: false },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: String,
    teamNumber: Number,
  },
  { timestamps: true },
);


workerServicesSchema.index({ name: "text", description: "text" });

module.exports = mongoose.model("WorkerServices", workerServicesSchema);
