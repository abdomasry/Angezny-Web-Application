const mongoose = require("mongoose");

const workerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    Category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    serviceCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
    title: {
      type: String,
      trim: true,
    },
    priceRange: {
      min: Number,
      max: Number,
    },
    availability: [
      {
        day: String,
        from: String,
        to: String,
      },
    ],
    skills: [String],
    portfolio: [
      {
        title: String,
        description: String,
        images: [String],
        completedAt: Date,
      },
    ],
    packages: [
      {
        title: String,
        description: String,
        price: Number,
        features: [String],
      },
    ],
    license: {
      name: String,
      number: String,
      fileUrl: String,
      status: {
        type: String,
        enum: ["not_submitted", "pending", "approved", "rejected"],
        default: "not_submitted",
      },
      rejectionReason: {
        type: String,
        default: "",
      },
      submittedAt: Date,
      reviewedAt: Date,
    },
    documents: [
      {
        type: {
          type: String,
          enum: ["id_card", "certificate", "license", "other"],
        },
        name: String,
        fileUrl: String,
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
      },
    ],
    // ─── Multi-license / training certificate flow ─────────────
    licenses: [
      {
        name: { type: String, required: true, trim: true },
        number: { type: String, default: "", trim: true },
        fileUrl: { type: String, required: true },
        issuedBy: { type: String, default: "", trim: true },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        rejectionReason: { type: String, default: "" },
        active: { type: Boolean, default: false },
        submittedAt: { type: Date, default: Date.now },
        reviewedAt: Date,
      },
    ],
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    // ─── Single-category lock ───────────────────────────────────
    // True for profiles created via the new "Become a Provider"
    singleCategoryEnforced: {
      type: Boolean,
      default: false,
    },
    ratingAverage: {
      type: Number,
      default: 0,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
    // ─── Location (geo-aware) ────────────────────────────────────
    location: {
      address: { type: String, default: "" },
      governorate: { type: String, default: "" },
      city: { type: String, default: "" },
      // GeoJSON Point 
      // coords through PUT /api/workers/me/location. We deliberately do
      // The controller assembles the full GeoJSON object on save:
      // location.point = { type: "Point", coordinates: [lng, lat] }
      point: {
        type: { type: String, enum: ["Point"] },
        // [longitude, latitude] — GeoJSON order, not [lat, lng].
        coordinates: { type: [Number], default: undefined },
      },
    },
    typeOfWorker: {
      type: String,
      enum: ["individual", "company"],
    },
    services: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerServices",
    }],
    reports: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reports",
    }],
    adminChat: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
    }],
    liveChat: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveChat",
    }],
    // ─── Wallet ──────────────────────────────────────────────────
    walletBalance: { type: Number, default: 0 },
    lifetimeEarnings: { type: Number, default: 0 },
    lifetimeWithdrawn: { type: Number, default: 0 },
    // ─── Payout destination ──────────────────────────────────────
    // Where the worker wants withdrawal money sent. Set via
    // POST /api/worker/payouts/info. `method` picks which of the three
    // detail blocks below is actually used at withdrawal time. All inner
    // fields are optional individually; the controller enforces that the
    // right block is filled in for the selected method.
    payoutInfo: {
      method: {
        type: String,
        enum: ["bank", "instapay", "wallet"],
      },
      // Bank transfer destination
      bankAccountNumber: String,
      bankName: String,
      accountHolderName: String,
      // InstaPay alias, e.g. "abdullah@instapay"
      instapayAlias: String,
      // Mobile-wallet phone number, e.g. "01012345678"
      walletPhone: String,
      updatedAt: Date,
    },
    // ─── Rank system ─────────────────────────────────────────────
    // Server-managed. Set automatically by the order-completion hook
    // (see order.controller.js). Clients must not write these.
    rank: {
      type: String,
      enum: ["bronze", "silver", "gold", "platinum", "diamond"],
      default: "bronze",
    },
    completedOrdersCount: {
      type: Number,
      default: 0,
    },
    // ─── Working hours ───────────────────────────────────────────
    workingHours: [
      {
        _id: false,
        day: {
          type: String,
          enum: ["sat", "sun", "mon", "tue", "wed", "thu", "fri"],
        },
        from: String, // "HH:MM" 24-hour format, e.g. "09:00"
        to: String,
        enabled: { type: Boolean, default: true },
      },
    ],
  },
  { timestamps: true },
);

// Compound indexes for the most common filter combinations on /workers.
// Without these, the listing falls back to a full collection scan once the
// dataset grows past a few thousand profiles.
workerProfileSchema.index({ verificationStatus: 1, ratingAverage: -1 });
workerProfileSchema.index({ verificationStatus: 1, totalReviews: -1 });

// Text index covers worker-level searchable fields. Service-level search lives
// on WorkerServices' own text index.
workerProfileSchema.index({ title: "text", skills: "text" });

workerProfileSchema.index({ "location.point": "2dsphere" }, { sparse: true });

module.exports = mongoose.model("WorkerProfile", workerProfileSchema);
