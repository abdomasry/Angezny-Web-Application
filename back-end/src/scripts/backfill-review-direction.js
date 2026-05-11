// ============================================================
// One-shot migration: stamp `direction: "customer_to_worker"` on every
// existing Review document that lacks the field.
//
// Run with:
//   cd back-end
//   node src/scripts/backfill-review-direction.js
// ============================================================

require("dotenv").config();
const mongoose = require("mongoose");
const Review = require("../models/Review");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const result = await Review.updateMany(
      { direction: { $exists: false } },
      { $set: { direction: "customer_to_worker" } }
    );
    console.log(
      `Backfill complete. Matched: ${result.matchedCount}  Modified: ${result.modifiedCount}`
    );
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
