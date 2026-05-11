const mongoose = require("mongoose");

// SearchLog — one row per search the user actually committed to
// (clicked a suggestion or hit Enter).
const searchLogSchema = new mongoose.Schema(
  {
    // The search term itself, lowercased + trimmed so "Plumbing", "plumbing",
    // and " plumbing " all aggregate together.
    query: { type: String, required: true, lowercase: true, trim: true, index: true },
    // Which dropdown group the user picked from, or "text" for free-form submits.
    // Useful later if we want to weight service-name searches differently than
    // category clicks.
    kind: { type: String, enum: ["service", "category", "text"], default: "text" },
  },
  { timestamps: true },
);

// TTL index — MongoDB deletes each log 30 days after creation.
// This keeps the "top searches" reflecting RECENT interest, not all-time history.
searchLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model("SearchLog", searchLogSchema);
