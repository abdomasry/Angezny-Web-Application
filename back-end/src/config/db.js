const mongoose = require("mongoose")

// One-time cleanup of half-built geo sub-docs from an earlier schema version
// that defaulted `location.point.type` to "Point" without coordinates. Those
// docs make every subsequent save fail with:
//   Can't extract geo keys: ... Point must be an array or object
// because the 2dsphere index can't extract a point that has a type but no
// coordinates. We unset the bad subdocs so saves go through; affected
// users can re-pin via the map picker afterwards.
async function cleanupBrokenGeoDocs() {
  try {
    const WorkerProfile = mongoose.model("WorkerProfile")
    const workerRes = await WorkerProfile.updateMany(
      {
        "location.point.type": { $exists: true },
        $or: [
          { "location.point.coordinates": { $exists: false } },
          { "location.point.coordinates": { $size: 0 } },
        ],
      },
      { $unset: { "location.point": "" } },
    )
    if (workerRes.modifiedCount > 0) {
      console.log(`🧹 Cleaned ${workerRes.modifiedCount} worker profile(s) with broken geo points`)
    }

    // Customer addresses live as a sub-array; arrayFilters with multiple
    // top-level conditions ($or alongside a field path) is rejected by
    // Mongo with "Expected a single top-level field name". Cheaper for a
    // one-time cleanup to load the affected docs and patch them in JS —
    // there are at most a handful of customers with broken geo subdocs.
    const CustomerProfile = mongoose.model("CustomerProfile")
    const broken = await CustomerProfile.find({ "addresses.point.type": { $exists: true } })
    let customerCount = 0
    for (const profile of broken) {
      let dirty = false
      for (const addr of profile.addresses || []) {
        const coords = addr.point && addr.point.coordinates
        const hasCoords = Array.isArray(coords) && coords.length === 2
        if (addr.point && !hasCoords) {
          addr.point = undefined
          dirty = true
        }
      }
      if (dirty) {
        await profile.save()
        customerCount++
      }
    }

  } catch (err) {
    // Cleanup failures are non-fatal — we'd rather the server start with
    // (some) broken docs than refuse to boot. The error log surfaces it.
    console.error("Geo cleanup error:", err.message)
  }
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI)
    console.log(`MongoDB connected: ${conn.connection.host}`)
    // Models must be registered before we can query them — require them here
    // (rather than at module top) to avoid a circular-import hazard.
    require("../models/Worker.Profile")
    require("../models/Customer.Profile")
    await cleanupBrokenGeoDocs()
  } catch (error) {
    console.log(`MongoDB error: ${error.message}`)
    process.exit(1) 
  }
}

module.exports = connectDB