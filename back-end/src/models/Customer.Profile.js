const mongoose = require("mongoose");

const customerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    profilePicture: {
      type: String,
    },
    numberOfOrders: {
      type: Number,
      default: 0,
    },
    location: {
      type: String,
    },
    reviews: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
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
    // ─── Saved addresses ─────────────────────────────────────────
    // Each address is a small object; one of them can be the primary.
    // _id: false would prevent stable IDs we need for update/delete,
    // so we keep Mongoose's auto-_id here intentionally.
    addresses: [
      {
        label: { type: String, default: "المنزل" },
        addressLine: String,
        governorate: String,
        city: String,
        area: String,
        isPrimary: { type: Boolean, default: false },
        // Optional GeoJSON pin set from the in-form map picker. Keeps the
        // saved address recallable on the map and ready for future
        // distance-aware features. `coordinates`
        // undefined for legacy addresses entered before the picker existed.
        point: {
          type: { type: String, enum: ["Point"] },
          coordinates: { type: [Number], default: undefined },
        },
      },
    ],
    // ─── Favorites ───────────────────────────────────────────────
    favoriteCategoryIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    ],
    favoriteWorkerIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ],
    // ─── Customer rating ─────────────────────────────────────────
    // Workers rate customers after order completion. The scoring
    // flow is not implemented yet — these fields default to 0 and
    // will be populated once the worker-rates-customer flow exists.
    ratingAverage: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    // ─── Account preferences ────────────────────────────────────
    preferredLanguage: { type: String, enum: ["ar", "en"], default: "ar" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("CustomerProfile", customerProfileSchema);
