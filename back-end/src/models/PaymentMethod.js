const mongoose = require("mongoose");

// ============================================================
// PaymentMethod Model
// ============================================================

const paymentMethodSchema = new mongoose.Schema(
  {
    // Which user owns this payment method.
    // ref: "User" lets us use .populate() later to get user details.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The name printed on the card (e.g., "ABDULLAH MOHAMED").
    cardholderName: {
      type: String,
      required: [true, "Cardholder name is required"],
      trim: true, // Remove leading/trailing spaces
    },

    // Only the last 4 digits of the card number.
    lastFourDigits: {
      type: String,
      required: [true, "Last four digits are required"],
      match: [/^\d{4}$/, "Must be exactly 4 digits"],
    },

    // The card network/brand. We limit it to 3 options with `enum`.
    cardBrand: {
      type: String,
      enum: ["visa", "mastercard", "meza"],
      default: "visa",
    },

    // Expiry month (1-12). min/max enforce the valid range.
    expiryMonth: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },

    // Expiry year (e.g., 2027). No max because years keep increasing.
    expiryYear: {
      type: Number,
      required: true,
    },

    // Whether this is the user's default/primary payment method.
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  // timestamps: true automatically adds createdAt and updatedAt fields.
  { timestamps: true }
);

module.exports = mongoose.model("PaymentMethod", paymentMethodSchema);
