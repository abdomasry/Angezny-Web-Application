const mongoose = require("mongoose");
const WorkerProfile = require("../models/Worker.Profile");
const WorkerServices = require("../models/Worker.Services");
const Review = require("../models/Review");
const ServiceRequest = require("../models/Service.Request");
const { parsePagination, paginationMeta } = require("../lib/pagination");

// getWorkers — Returns a paginated, filtered, sorted list of workers
// Escape regex-special characters so user input like "a+b" doesn't break the regex.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Fields that the listing card never renders. We $project them OUT after
// $geoNear so the per-document payload stays small. Anything heavy or
// internal goes here. Keep this list in sync with what the worker card
// actually shows on /providers.
const LISTING_EXCLUDE_FIELDS = {
  documents: 0,
  reports: 0,
  adminChat: 0,
  liveChat: 0,
  walletBalance: 0,
  lifetimeEarnings: 0,
  lifetimeWithdrawn: 0,
  licenses: 0,
  license: 0,
  portfolio: 0,
  packages: 0,
  availability: 0,
  workingHours: 0,
};

const getWorkers = async (req, res) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      minRating,
      q,                // free-text search across service name + description
      sort = "rating",
      // Geo params — only active when both lat & lng are provided.
      lat,
      lng,
      // Cursor pagination for the geo branch (page 2+):
      // afterDistance is in METERS (matches Mongo's distanceField output).
      afterDistance,
      afterId,
    } = req.query;

    // Pagination via the shared helper — bounds-checked + capped at 100/page.
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 10, maxLimit: 50 });

    // Are we in geo mode? Both coords must be valid finite numbers.
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const geoMode = Number.isFinite(latNum) && Number.isFinite(lngNum);

    const filter = {
      // Only show approved workers (not pending or rejected verification).
      verificationStatus: "approved",
    };

    // ─── Category filter ──────────────────────────────────────
    if (category) {
      const categoryIds = String(category).split(",").map(s => s.trim()).filter(Boolean);
      if (categoryIds.length > 0) {
        const workerIdsInCategory = await WorkerServices.distinct("workerID", {
          categoryId: { $in: categoryIds },
          active: true,
        });
        filter._id = { $in: workerIdsInCategory };
      }
    }

    // ─── Free-text search ────────────────────────────────────
    if (q && q.trim()) {
      const trimmed = q.trim();
      const serviceFilter = { active: true };
      if (trimmed.length >= 3) {
        serviceFilter.$text = { $search: trimmed };
      } else {
        serviceFilter.name = new RegExp(`^${escapeRegex(trimmed)}`, "i");
      }
      const workerIdsMatchingQuery = await WorkerServices.distinct("workerID", serviceFilter);
      filter._id = filter._id
        ? { $in: filter._id.$in.filter(id => workerIdsMatchingQuery.some(qid => String(qid) === String(id))) }
        : { $in: workerIdsMatchingQuery };
    }

    if (minRating) {
      filter.ratingAverage = { $gte: parseFloat(minRating) };
    }

    // ─── Price filter ────────────────────────────────────────
    if (minPrice || maxPrice) {
      const priceFilter = {};
      if (minPrice) priceFilter.$gte = parseFloat(minPrice);
      if (maxPrice) priceFilter.$lte = parseFloat(maxPrice);

      const matchingWorkerIds = await WorkerServices.distinct("workerID", {
        price: priceFilter,
        active: true,
      });
      filter._id = filter._id
        ? { $in: filter._id.$in.filter(id => matchingWorkerIds.some(mid => String(mid) === String(id))) }
        : { $in: matchingWorkerIds };
    }

    // ════════════════════════════════════════════════════════════
    // GEO BRANCH — when the customer is on the "Nearest" tab
    // ════════════════════════════════════════════════════════════
    if (geoMode) {
      const SOFT_MAX_DISTANCE_M = 500_000; // 500 km sanity cap

      const geoNearStage = {
        $geoNear: {
          near: { type: "Point", coordinates: [lngNum, latNum] },
          distanceField: "distanceMeters",
          spherical: true,
          maxDistance: SOFT_MAX_DISTANCE_M,
          query: filter, // safe — no $text, only plain operators
        },
      };

      // Cursor: skip everything closer than (or equal-but-id-≤) the last
      // item on the previous page. Stable under inserts/deletes.
      const cursorStages = [];
      const afterDistNum = parseFloat(afterDistance);
      if (Number.isFinite(afterDistNum) && afterId && mongoose.isValidObjectId(afterId)) {
        cursorStages.push({
          $match: {
            $or: [
              { distanceMeters: { $gt: afterDistNum } },
              {
                distanceMeters: afterDistNum,
                _id: { $gt: new mongoose.Types.ObjectId(afterId) },
              },
            ],
          },
        });
      }

      // Fetch limit + 1 so we know whether there's a next page without a
      // separate count query (count on $geoNear is expensive).
      const pipeline = [
        geoNearStage,
        ...cursorStages,
        { $project: LISTING_EXCLUDE_FIELDS },
        { $limit: limit + 1 },
      ];

      const rawNear = await WorkerProfile.aggregate(pipeline);
      const hasMoreNear = rawNear.length > limit;
      const pageNear = hasMoreNear ? rawNear.slice(0, limit) : rawNear;

      // Hydrate with the same populate set the regular branch uses. We
      // run aggregate then re-populate via Model.populate so we can reuse
      // the same populate config without re-fetching docs.
      let withCoords = await WorkerProfile.populate(pageNear, [
        { path: "userId", select: "firstName lastName profileImage" },
        { path: "Category", select: "name image" },
        { path: "serviceCategories", select: "name image" },
        {
          path: "services",
          match: {
            active: true,
            approvalStatus: "approved",
            ...(category && (() => {
              const ids = String(category).split(",").map(s => s.trim()).filter(Boolean);
              return ids.length > 1 ? { categoryId: { $in: ids } } : { categoryId: ids[0] };
            })()),
            ...(q && q.trim() && (
              q.trim().length >= 3
                ? { $text: { $search: q.trim() } }
                : { name: new RegExp(`^${escapeRegex(q.trim())}`, "i") }
            )),
          },
          select: "name description images price typeofService priceRange categoryId",
        },
      ]);

      // Add a friendly distanceKm field for the card. distanceMeters stays
      // on the doc so the frontend can use it as the next-page cursor.
      withCoords = withCoords.map(w => ({
        ...w,
        distanceKm: Math.round((w.distanceMeters / 1000) * 10) / 10, // 1 decimal
      }));

      // Tail: workers with NO coords. Only attached on page 1 so we don't
      // duplicate them across "load more" calls. Limited to a small batch
      // — they're a fallback, not the main result.
      let withoutCoords = [];
      const isFirstPage = !afterDistance && !afterId;
      if (isFirstPage) {
        const tailFilter = {
          ...filter,
          $or: [
            { "location.point.coordinates": { $exists: false } },
            { "location.point.coordinates": { $size: 0 } },
          ],
        };
        withoutCoords = await WorkerProfile.find(tailFilter, LISTING_EXCLUDE_FIELDS)
          .populate("userId", "firstName lastName profileImage")
          .populate("Category", "name image")
          .populate("serviceCategories", "name image")
          .populate({
            path: "services",
            match: { active: true, approvalStatus: "approved" },
            select: "name description images price typeofService priceRange categoryId",
          })
          .sort({ ratingAverage: -1 })
          .limit(20)
          .lean();
      }

      // Cursor for the next page = distance + id of the last with-coords item.
      const last = withCoords[withCoords.length - 1];
      const nextCursor = hasMoreNear && last
        ? { afterDistance: last.distanceMeters, afterId: String(last._id) }
        : null;

      return res.json({
        workers: withCoords,
        workersWithoutLocation: withoutCoords, // page 1 only; [] on later pages
        pagination: {
          page,
          limit,
          hasMore: hasMoreNear,
          nextCursor,
          mode: "geo",
        },
      });
    }

    // ════════════════════════════════════════════════════════════
    // NON-GEO BRANCH — original code path, unchanged behavior
    // ════════════════════════════════════════════════════════════
    let sortObj;
    switch (sort) {
      case "price":         sortObj = { "priceRange.min": 1 }; break;
      case "rating":        sortObj = { ratingAverage: -1 }; break;
      case "mostOrdered":   sortObj = { totalReviews: -1 }; break;
      case "alphabetical":  sortObj = { createdAt: -1 }; break;
      default:              sortObj = { ratingAverage: -1 };
    }

    const total = await WorkerProfile.countDocuments(filter);

    let workers = await WorkerProfile.find(filter, LISTING_EXCLUDE_FIELDS)
      .populate("userId", "firstName lastName profileImage")
      .populate("Category", "name image")
      .populate("serviceCategories", "name image")
      .populate({
        path: "services",
        match: {
          active: true,
          approvalStatus: "approved",
          ...(category && (() => {
            const ids = String(category).split(",").map(s => s.trim()).filter(Boolean);
            return ids.length > 1 ? { categoryId: { $in: ids } } : { categoryId: ids[0] };
          })()),
          ...(q && q.trim() && (
            q.trim().length >= 3
              ? { $text: { $search: q.trim() } }
              : { name: new RegExp(`^${escapeRegex(q.trim())}`, "i") }
          )),
        },
        select: "name description images price typeofService priceRange categoryId",
      })
      .sort(sortObj)
      .skip(skip)
      .limit(limit);

    if (sort === "alphabetical") {
      workers = workers.sort((a, b) => {
        const nameA = a.userId?.firstName || "";
        const nameB = b.userId?.firstName || "";
        return nameA.localeCompare(nameB, "ar");
      });
    }

    res.json({
      workers,
      pagination: paginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.log("Worker listing error:", error.message);
    res.status(500).json({ message: "Server error, please try again" });
  }
};

// ============================================================
// PUT /api/workers/me/location
// ============================================================
const updateMyLocation = async (req, res) => {
  try {
    const { lng, lat, address = "", city = "" } = req.body || {};

    const lngNum = parseFloat(lng);
    const latNum = parseFloat(lat);

    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ message: "Invalid longitude" });
    }
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      return res.status(400).json({ message: "Invalid latitude" });
    }

    const updated = await WorkerProfile.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          "location.address": String(address).slice(0, 300),
          "location.city": String(city).slice(0, 100),
          "location.point": {
            type: "Point",
            coordinates: [lngNum, latNum],
          },
        },
      },
      { new: true, select: "location" },
    );

    if (!updated) {
      return res.status(404).json({ message: "Worker profile not found" });
    }

    res.json({ location: updated.location });
  } catch (error) {
    console.error("updateMyLocation error:", error);
    res.status(500).json({ message: "Server error updating location" });
  }
};

// ============================================================
// GET /api/workers/:id
// ============================================================
// Fetches a SINGLE worker's full profile by their WorkerProfile _id.
const getWorkerById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const workerProfile = await WorkerProfile.findById(req.params.id)
      .populate("userId", "firstName lastName profileImage bio createdAt")
      .populate("Category", "name image")
      .populate("serviceCategories", "name image")
      .populate({
        path: "services",
        match: { active: true, approvalStatus: "approved" },
        select: "name description images price typeofService priceRange categoryId",
        populate: { path: "categoryId", select: "name" },
      });

    if (!workerProfile) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const orderStats = await ServiceRequest.aggregate([
      {
        $match: {
          workerId: new mongoose.Types.ObjectId(workerProfile.userId?._id || workerProfile.userId),
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = orderStats.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const servicePrices = (workerProfile.services || []).flatMap((service) => {
      if (service.typeofService === "range" && service.priceRange?.min) return [service.priceRange.min];
      if (typeof service.price === "number") return [service.price];
      return [];
    });

    const completedOrders = counts.completed || 0;
    const historicalOrders = completedOrders + (counts.cancelled || 0) + (counts.rejected || 0);
    const startingPrice =
      workerProfile.priceRange?.min ||
      (servicePrices.length > 0 ? Math.min(...servicePrices) : 0);

    const worker = workerProfile.toObject();
    worker.publicStats = {
      completedOrders,
      historicalOrders,
      successRate: historicalOrders > 0 ? Math.round((completedOrders / historicalOrders) * 100) : 0,
      startingPrice,
    };

    res.json({ worker });
  } catch (error) {
    console.error("getWorkerById error:", error);
    res.status(500).json({ message: "Server error fetching worker profile" });
  }
};

// ============================================================
// GET /api/workers/:id/reviews?page=1&limit=10
// ============================================================
// Fetches paginated reviews for a specific worker.
const getWorkerReviews = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 10, maxLimit: 50 });

    // Step 1: Find the worker profile to get the userId
    const workerProfile = await WorkerProfile.findById(req.params.id);
    if (!workerProfile) {
      return res.status(404).json({ message: "Worker not found" });
    }

    const filter = {
      workerId: workerProfile.userId,
      direction: "customer_to_worker",
    };
    const total = await Review.countDocuments(filter);

    const reviews = await Review.find(filter)
      .populate("customerId", "firstName lastName profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      reviews,
      pagination: paginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("getWorkerReviews error:", error);
    res.status(500).json({ message: "Server error fetching reviews" });
  }
};

// ============================================================
// GET /api/workers/service/:serviceId
// ============================================================
const getServiceById = async (req, res) => {
  try {
    const service = await WorkerServices.findById(req.params.serviceId)
      .populate({
        path: "workerID",
        // Include ratingAverage + totalReviews + rank so the service detail
        // page can render trust signals (stars, count, rank badge) on the
        // worker card without a second round-trip.
        select: "userId verificationStatus ratingAverage totalReviews rank",
        populate: { path: "userId", select: "firstName lastName profileImage" },
      })
      .populate("categoryId", "name");

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }
    // Only expose services that are publicly orderable.
    if (!service.active || service.approvalStatus !== "approved") {
      return res.status(404).json({ message: "Service not available" });
    }

    res.json({ service });
  } catch (error) {
    console.error("getServiceById error:", error);
    res.status(500).json({ message: "Server error fetching service" });
  }
};

module.exports = { getWorkers, getWorkerById, getWorkerReviews, getServiceById, updateMyLocation };
