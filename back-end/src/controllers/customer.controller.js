const mongoose = require("mongoose");
const User = require("../models/User.Model");
const CustomerProfile = require("../models/Customer.Profile");
const ServiceRequest = require("../models/Service.Request");
const { parsePagination, paginationMeta } = require("../lib/pagination");

// ============================================================
// GET /api/customer/profile
// ============================================================
// This function gets the full customer profile for the logged-in user.
const getProfile = async (req, res) => {
  try {
    // req.user is set by authMiddleware — it contains the full User document
    // (minus the password) for whoever sent the request.
    const userId = req.user._id;

    // findOne looks for a CustomerProfile where userId matches.
    // If none exists, customerProfile will be null.
    let customerProfile = await CustomerProfile.findOne({ userId })
      .populate("favoriteCategoryIds", "name image")
      .populate("favoriteWorkerIds", "firstName lastName profileImage");

    // Auto-create: if this user has never had a profile, make one now.
    // This avoids forcing every signup to also create a CustomerProfile.
    if (!customerProfile) {
      const fresh = await CustomerProfile.create({ userId });
      customerProfile = await CustomerProfile.findById(fresh._id)
        .populate("favoriteCategoryIds", "name image")
        .populate("favoriteWorkerIds", "firstName lastName profileImage");
    }

    // Count how many service requests (orders) this customer has made.
    // countDocuments is more efficient than fetching all documents and
    // counting them — it just asks MongoDB for the count directly.
    const totalOrders = await ServiceRequest.countDocuments({
      customerId: userId,
    });

    res.json({
      profile: {
        _id: customerProfile._id,
        userId: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        phone: req.user.phone,
        profileImage: req.user.profileImage,
        role: req.user.role,
        bio: req.user.bio,
        location: req.user.location,
        status: req.user.status,
        isVerified: req.user.isVerified,
        notificationPreferences: req.user.notificationPreferences,
        numberOfOrders: totalOrders,
        memberSince: req.user.createdAt,
        // ─── Enhanced profile additions ─────────────────────
        addresses: customerProfile.addresses || [],
        favoriteCategories: customerProfile.favoriteCategoryIds || [],
        favoriteWorkers: customerProfile.favoriteWorkerIds || [],
        ratingAverage: customerProfile.ratingAverage || 0,
        totalRatings: customerProfile.totalRatings || 0,
        preferredLanguage: customerProfile.preferredLanguage || "ar",
      },
    });
  } catch (error) {
    console.error("getProfile error:", error);
    res.status(500).json({ message: "Server error fetching profile" });
  }
};

// ============================================================
// PUT /api/customer/profile
// ============================================================
// Updates the customer's profile. Some fields live on the User model
// (firstName, lastName, phone, bio, location) and some on CustomerProfile
// (location string). We update both.

const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { firstName, lastName, phone, bio, location, email, preferredLanguage, favoriteCategoryIds, profileImage } = req.body;

    const userUpdates = {
      ...(firstName && { firstName }),
      ...(lastName && { lastName }),
      ...(phone && { phone }),
      ...(bio && { bio }),
      ...(location && { location }),
      ...(profileImage !== undefined && { profileImage: String(profileImage || "").trim() }),
    };

    // Allow phone-only users to add an email address
    // Once email is set and verified, it can't be changed
    if (email && !req.user.email) {
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      userUpdates.email = email;
      userUpdates.verificationCode = verificationCode;
      userUpdates.verificationCodeExpires = Date.now() + 10 * 60 * 1000;
      userUpdates.isVerified = false;

      // Send verification email (imported at top of file)
      const { sendVerificationEmail } = require("../config/email");
      sendVerificationEmail(email, verificationCode).catch(err => {
        console.log("Email sending failed:", err.message);
      });
    }

    // findByIdAndUpdate options:
    //   { new: true }           → return the UPDATED document, not the old one
    //   { runValidators: true } → still check schema rules (minlength, regex, etc.)
    const updatedUser = await User.findByIdAndUpdate(userId, userUpdates, {
      new: true,
      runValidators: true,
    }).select("-password");

    // Also update the CustomerProfile's location field if it was sent.
    // The CustomerProfile has its own simple location string (e.g. "Cairo, Nasr City")
    if (location) {
      await CustomerProfile.findOneAndUpdate(
        { userId },
        { location: `${location.city || ""}, ${location.area || ""}`.trim() },
      );
    }

    // Profile-level fields that live on CustomerProfile only.
    const profileUpdates = {};
    if (preferredLanguage && ["ar", "en"].includes(preferredLanguage)) {
      profileUpdates.preferredLanguage = preferredLanguage;
    }
    if (Array.isArray(favoriteCategoryIds)) {
      profileUpdates.favoriteCategoryIds = [...new Set(
        favoriteCategoryIds.filter(id => mongoose.isValidObjectId(id)).map(String),
      )];
    }
    if (Object.keys(profileUpdates).length > 0) {
      await CustomerProfile.findOneAndUpdate({ userId }, profileUpdates);
    }

    // Recount orders for accurate response
    const totalOrders = await ServiceRequest.countDocuments({ customerId: userId });

    res.json({
      profile: {
        userId: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        phone: updatedUser.phone,
        profileImage: updatedUser.profileImage,
        role: updatedUser.role,
        bio: updatedUser.bio,
        location: updatedUser.location,
        status: updatedUser.status,
        isVerified: updatedUser.isVerified,
        numberOfOrders: totalOrders,
        memberSince: updatedUser.createdAt,
      },
    });
  } catch (error) {
    console.error("updateProfile error:", error);
    res.status(500).json({ message: "Server error updating profile" });
  }
};

// ============================================================
// GET /api/customer/orders?status=in_progress&page=1&limit=10
// ============================================================
// Fetches the customer's orders, split into two categories:
//   - "in_progress" → orders that are still active (pending, accepted, in_progress)
//   - "history"     → orders that are done (completed, cancelled, rejected)
const getOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    // Extract query parameters with defaults.
    // parseInt converts the string "2" from the URL into the number 2.
    // || provides a fallback if the value is NaN or 0.
    const status = req.query.status || "in_progress";
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 10, maxLimit: 50 });

    // Decide which statuses to filter by based on the status parameter.
    let statusFilter;
    if (status === "in_progress") {
      statusFilter = ["pending", "accepted", "in_progress"];
    } else {
      // "history" — orders that have reached a final state
      statusFilter = ["completed", "cancelled", "rejected"];
    }

    // Count total matching orders (needed for pagination info on the frontend,
    // e.g., "showing page 2 of 5").
    const totalOrders = await ServiceRequest.countDocuments({
      customerId: userId,
      status: { $in: statusFilter },
    });

    // Fetch the actual orders with filtering, population, sorting, and pagination.
    const orders = await ServiceRequest.find({
      customerId: userId,
      status: { $in: statusFilter }, // Only orders matching our status group
    })
      .populate("workerId", "firstName lastName profileImage") // Get worker details
      .populate("categoryId", "name") // Get category name
      .populate("serviceId", "name images price typeofService priceRange") // Service details (name/price)
      .sort({ createdAt: -1 }) // Newest first (-1 = descending)
      .skip(skip)
      .limit(limit)
      .lean(); // lean() so we can splice in a synthetic `review` field below

    // Attach the customer's own review (if any) to each order so the UI can
    const Review = require("../models/Review");
    const orderIds = orders.map(o => o._id);
    const reviews = await Review.find({
      serviceRequestId: { $in: orderIds },
      customerId: userId,
    }).lean();
    const reviewByOrder = new Map(reviews.map(r => [String(r.serviceRequestId), r]));
    for (const o of orders) {
      const r = reviewByOrder.get(String(o._id));
      if (r) o.review = r;
    }

    res.json({
      orders,
      pagination: paginationMeta({ page, limit, total: totalOrders }),
    });
  } catch (error) {
    console.error("getOrders error:", error);
    res.status(500).json({ message: "Server error fetching orders" });
  }
};

// ============================================================
// Address management
// ============================================================
// All four handlers operate on CustomerProfile.addresses (an
// Helper — auto-create the profile if it doesn't exist yet.
const getOrCreateProfile = async (userId) => {
  let profile = await CustomerProfile.findOne({ userId });
  if (!profile) profile = await CustomerProfile.create({ userId });
  return profile;
};

// Validate + normalize a {lng, lat} pair from the request body. Returns a
// GeoJSON Point on success, null when no coords were supplied (so the caller
// can leave the field undefined), or throws with a 400-friendly message.
const buildPointOrNull = (lng, lat) => {
  if (lng === undefined && lat === undefined) return null;
  const lngNum = parseFloat(lng);
  const latNum = parseFloat(lat);
  if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
    const err = new Error("Invalid longitude"); err.status = 400; throw err;
  }
  if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
    const err = new Error("Invalid latitude"); err.status = 400; throw err;
  }
  return { type: "Point", coordinates: [lngNum, latNum] };
};

// POST /api/customer/addresses
const addAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { label, addressLine, city, area, isPrimary, lng, lat } = req.body || {};
    if (!addressLine || !addressLine.trim()) {
      return res.status(400).json({ message: "العنوان مطلوب" });
    }
    let point;
    try { point = buildPointOrNull(lng, lat); }
    catch (e) { return res.status(e.status || 400).json({ message: e.message }); }

    const profile = await getOrCreateProfile(userId);
    const isFirst = (profile.addresses || []).length === 0;
    const next = {
      label: String(label || "المنزل").trim(),
      addressLine: String(addressLine).trim(),
      city: String(city || "").trim(),
      area: String(area || "").trim(),
      isPrimary: isFirst || isPrimary === true,
      ...(point ? { point } : {}),
    };
    // If this becomes primary, demote any existing primary first.
    if (next.isPrimary) {
      profile.addresses = (profile.addresses || []).map(a => ({
        ...a.toObject(), isPrimary: false,
      }));
    }
    profile.addresses.push(next);
    await profile.save();
    res.json({ addresses: profile.addresses });
  } catch (err) {
    console.error("addAddress error:", err);
    res.status(500).json({ message: "Server error adding address" });
  }
};

// PUT /api/customer/addresses/:id
const updateAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { label, addressLine, city, area, isPrimary, lng, lat } = req.body || {};
    let point;
    try { point = buildPointOrNull(lng, lat); }
    catch (e) { return res.status(e.status || 400).json({ message: e.message }); }

    const profile = await CustomerProfile.findOne({ userId });
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    const addr = profile.addresses.id(id);
    if (!addr) return res.status(404).json({ message: "Address not found" });
    if (label !== undefined) addr.label = String(label).trim();
    if (addressLine !== undefined) addr.addressLine = String(addressLine).trim();
    if (city !== undefined) addr.city = String(city).trim();
    if (area !== undefined) addr.area = String(area).trim();
    if (point) addr.point = point;
    if (isPrimary === true) {
      profile.addresses.forEach(a => { a.isPrimary = false; });
      addr.isPrimary = true;
    }
    await profile.save();
    res.json({ addresses: profile.addresses });
  } catch (err) {
    console.error("updateAddress error:", err);
    res.status(500).json({ message: "Server error updating address" });
  }
};

// DELETE /api/customer/addresses/:id
const deleteAddress = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const profile = await CustomerProfile.findOne({ userId });
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    const addr = profile.addresses.id(id);
    if (!addr) return res.status(404).json({ message: "Address not found" });
    const wasPrimary = addr.isPrimary;
    profile.addresses.pull(id);
    // If we deleted the primary and there are still addresses left,
    // promote the first remaining one so there's always a primary.
    if (wasPrimary && profile.addresses.length > 0) {
      profile.addresses[0].isPrimary = true;
    }
    await profile.save();
    res.json({ addresses: profile.addresses });
  } catch (err) {
    console.error("deleteAddress error:", err);
    res.status(500).json({ message: "Server error deleting address" });
  }
};

// ============================================================
// Favorite workers — toggle on/off
// ============================================================
// POST /api/customer/favorites/workers/:workerId  (toggle)
const toggleFavoriteWorker = async (req, res) => {
  try {
    const userId = req.user._id;
    const { workerId } = req.params;
    if (!mongoose.isValidObjectId(workerId)) {
      return res.status(400).json({ message: "Invalid worker id" });
    }
    const profile = await getOrCreateProfile(userId);
    const idx = profile.favoriteWorkerIds.findIndex(id => String(id) === String(workerId));
    let isFavorite;
    if (idx >= 0) {
      profile.favoriteWorkerIds.splice(idx, 1);
      isFavorite = false;
    } else {
      profile.favoriteWorkerIds.push(workerId);
      isFavorite = true;
    }
    await profile.save();
    res.json({ isFavorite, favoriteWorkerIds: profile.favoriteWorkerIds });
  } catch (err) {
    console.error("toggleFavoriteWorker error:", err);
    res.status(500).json({ message: "Server error toggling favorite" });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getOrders,
  addAddress,
  updateAddress,
  deleteAddress,
  toggleFavoriteWorker,
};
