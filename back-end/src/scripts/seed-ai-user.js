// seed-ai-user.js — one-time, idempotent.
//
// Creates the single "system" User document used as the sender of every
// AI-assistant message. The chat schema requires every LiveChat to have a
// senderId pointing at a real User, so we need one stable ObjectId we can
// attribute AI replies to.
//
// This account:
//   - has role "ai" (added to the enum in User.Model.js)
//   - has no password — `provider: "local"` would normally require one, so
//     we set provider: "google" to bypass that branch of the pre-save hook
//   - has status "active" so banned/suspended checks in the socket auth
//     middleware don't accidentally trip over it (it never logs in anyway)
//   - is found by AI_USER_EMAIL at server startup → cached in global.AI_USER_ID
//
// Re-running this is safe: if a user with AI_USER_EMAIL already exists, we
// leave it alone (only refresh the displayed name).
//
// Usage:
//   cd back-end && node src/scripts/seed-ai-user.js

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User.Model");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set; aborting.");
    process.exit(1);
  }
  const email = (process.env.AI_USER_EMAIL || "ai-assistant@system.local").toLowerCase();

  await mongoose.connect(uri);
  console.log("connected to", uri.replace(/:[^:@]+@/, ":***@"));

  // We deliberately bypass Mongoose validation here:
  //   - The User schema enforces a 3-char minimum on names and a strict
  //     email regex (TLD 2-3 chars). The system AI user wants the short
  //     name "AI" and a .local email — neither is intended for human
  //     users, and changing the schema to accommodate them would weaken
  //     validation everywhere else.
  //   - Using the native driver (User.collection.insertOne/updateOne)
  //     skips schema validators and pre-save hooks entirely, which is
  //     exactly what we want for a synthetic system row.
  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) {
    await User.collection.updateOne(
      { _id: existing._id },
      {
        $set: {
          firstName: "AI",
          lastName: "Assistant",
          role: "ai",
          status: "active",
          isVerified: true,
          updatedAt: new Date(),
        },
      },
    );
    console.log(`AI user already exists — refreshed. _id=${existing._id}`);
  } else {
    const now = new Date();
    const insertResult = await User.collection.insertOne({
      email,
      firstName: "AI",
      lastName: "Assistant",
      role: "ai",
      // provider: "google" sidesteps the "password required for local users"
      // validator path if anyone ever runs `.save()` on this doc.
      provider: "google",
      // A deterministic googleId so a second run with the same email never
      // races against the unique sparse index.
      googleId: `system-ai-${email}`,
      status: "active",
      isVerified: true,
      notificationPreferences: { orders: false, messages: false, promotions: false },
      blockedUsers: [],
      favorites: [],
      customerRatingAverage: 0,
      customerTotalReviews: 0,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`AI user created. _id=${insertResult.insertedId}`);
  }

  console.log("\nPaste this into back-end/.env if not already present:");
  console.log(`AI_USER_EMAIL=${email}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error("seed-ai-user failed:", err);
  process.exit(1);
});
