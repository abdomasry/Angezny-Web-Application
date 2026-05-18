
require("dotenv").config();
const mongoose = require("mongoose");
const ServiceRequest = require("../models/Service.Request");
const { reverseGeocode } = require("../utils/geocode");

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set; aborting.");
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log("connected to", uri.replace(/:[^:@]+@/, ":***@"));

  // Find orders with coords but missing at least one of the analytics
  // fields. We treat empty string the same as missing — older code may
  // have written "" instead of leaving the key out.
  const candidates = await ServiceRequest.find({
    "location.lat": { $ne: null, $exists: true },
    "location.lng": { $ne: null, $exists: true },
    $or: [
      { "location.governorate": { $in: [null, ""] } },
      { "location.governorate": { $exists: false } },
      { "location.city": { $in: [null, ""] } },
      { "location.city": { $exists: false } },
    ],
  })
    .select("_id location")
    .lean();

  console.log(`found ${candidates.length} order(s) needing geo backfill`);

  let updated = 0;
  let skipped = 0;
  for (let i = 0; i < candidates.length; i++) {
    const o = candidates[i];
    const lat = Number(o.location?.lat);
    const lng = Number(o.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped++;
      continue;
    }
    const geo = await reverseGeocode(lat, lng);
    if (!geo) {
      skipped++;
      console.log(`  ${o._id}: no usable geocode result`);
      continue;
    }
    const update = {};
    if (!o.location?.governorate && geo.governorate) {
      update["location.governorate"] = geo.governorate;
    }
    if (!o.location?.city && geo.city) {
      update["location.city"] = geo.city;
    }
    if (Object.keys(update).length === 0) {
      skipped++;
      continue;
    }
    await ServiceRequest.updateOne({ _id: o._id }, { $set: update });
    updated++;
    console.log(
      `  ${o._id}: +${Object.keys(update).join(", ")} → ${JSON.stringify(update)}`,
    );
    // Progress heartbeat on long backlogs.
    if ((i + 1) % 10 === 0) {
      console.log(`  …processed ${i + 1}/${candidates.length}`);
    }
  }

  console.log(`done. ${updated} updated, ${skipped} skipped.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
