const mongoose = require("mongoose");

// ============================================================
// ProviderApplication
// ============================================================
// One row = one customer's request to become a service provider (worker).
const proposedServiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    price: { type: Number, default: 0 },
    typeofService: {
      type: String,
      enum: ["hourly", "fixed", "range"],
      default: "fixed",
    },
    priceRange: {
      min: { type: Number },
      max: { type: Number },
    },
    images: [{ type: String }], // Cloudinary URLs (optional)
    pdfs: [{ type: String }],   // Cloudinary URLs for spec sheets / catalogs (optional)
  },
  { _id: false }
);

const providerApplicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bio: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    proposedServices: [proposedServiceSchema],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: { type: String, default: "" },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Only ONE active (pending or approved) application per user. A rejected
// application is allowed to sit alongside a new pending one so customers can
// re-apply after rejection.
providerApplicationSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending", "approved"] } } }
);

module.exports = mongoose.model("ProviderApplication", providerApplicationSchema);
