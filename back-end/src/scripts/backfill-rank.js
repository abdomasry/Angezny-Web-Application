// backfill-rank.js — one-time, idempotent migration.
//
// Walks every WorkerProfile, counts how many of that worker's
// ServiceRequests are in `completed` status, writes that count
// to `completedOrdersCount`, computes the rank from it, and
// saves. Safe to re-run — it overwrites with current values
// rather than incrementing.
//
// Usage:
//   cd back-end && node src/scripts/backfill-rank.js
//
// Reads MONGO_URI from .env. Disconnects when done.

require("dotenv").config();
const mongoose = require("mongoose");
const WorkerProfile = require("../models/Worker.Profile");
const ServiceRequest = require("../models/Service.Request");
const { computeRank } = require("../lib/rank");

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set; aborting.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("connected to", uri.replace(/:[^:@]+@/, ":***@"));

  const profiles = await WorkerProfile.find({}).select("_id userId rank completedOrdersCount");
  console.log(`found ${profiles.length} worker profile(s)`);

  let changed = 0;
  for (const profile of profiles) {
    const count = await ServiceRequest.countDocuments({
      workerId: profile.userId,
      status: "completed",
    });
    const rank = computeRank(count);
    if (profile.completedOrdersCount !== count || profile.rank !== rank) {
      const prev = `${profile.completedOrdersCount}/${profile.rank}`;
      profile.completedOrdersCount = count;
      profile.rank = rank;
      await profile.save();
      changed += 1;
      console.log(`  ${profile._id}: ${prev} → ${count}/${rank}`);
    }
  }

  console.log(`done. ${changed} profile(s) updated.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
