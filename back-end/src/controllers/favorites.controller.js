// ============================================================
// Favorites Controller
// ============================================================
// One favorites list per user. Stored as an array of worker
// User._ids on the User document itself (User.favorites).
// ============================================================

const mongoose = require("mongoose");
const User = require("../models/User.Model");
const WorkerProfile = require("../models/Worker.Profile");

// GET /api/favorites
const listFavorites = async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
      .select("favorites")
      .populate({
        path: "favorites",
        select: "firstName lastName profileImage role",
      });

    if (!me) return res.status(404).json({ message: "User not found" });

    const userIds = (me.favorites || []).map((u) => u._id);

    // Pull the matching WorkerProfile for each favorite user. We do this in a
    const profiles = await WorkerProfile.find({ userId: { $in: userIds } })
      .select(
        "userId title ratingAverage totalReviews completedOrdersCount rank location priceRange"
      );
    const byUserId = new Map(profiles.map((p) => [String(p.userId), p]));

    const cards = (me.favorites || []).map((u) => {
      const profile = byUserId.get(String(u._id));
      return {
        userId: { _id: u._id, firstName: u.firstName, lastName: u.lastName, profileImage: u.profileImage },
        profileId: profile?._id || null,
        title: profile?.title || "",
        ratingAverage: profile?.ratingAverage || 0,
        totalReviews: profile?.totalReviews || 0,
        completedOrdersCount: profile?.completedOrdersCount || 0,
        rank: profile?.rank || "bronze",
        location: profile?.location || null,
        priceRange: profile?.priceRange || null,
      };
    });

    res.json({ favorites: cards, ids: userIds });
  } catch (err) {
    console.error("listFavorites error:", err);
    res.status(500).json({ message: "Server error fetching favorites" });
  }
};

// POST /api/favorites/:workerId
// Validates that the target is actually a worker.
const addFavorite = async (req, res) => {
  try {
    const { workerId } = req.params;
    if (!mongoose.isValidObjectId(workerId)) {
      return res.status(400).json({ message: "Invalid worker id" });
    }
    if (String(workerId) === String(req.user._id)) {
      return res.status(400).json({ message: "Cannot favorite yourself" });
    }

    const target = await User.findById(workerId).select("role");
    if (!target) return res.status(404).json({ message: "Worker not found" });
    if (target.role !== "worker") {
      return res.status(400).json({ message: "Target is not a worker" });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { favorites: workerId } },
      { new: true, select: "favorites" }
    );

    res.json({ ids: updated?.favorites || [] });
  } catch (err) {
    console.error("addFavorite error:", err);
    res.status(500).json({ message: "Server error adding favorite" });
  }
};

// DELETE /api/favorites/:workerId
const removeFavorite = async (req, res) => {
  try {
    const { workerId } = req.params;
    if (!mongoose.isValidObjectId(workerId)) {
      return res.status(400).json({ message: "Invalid worker id" });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { favorites: workerId } },
      { new: true, select: "favorites" }
    );

    res.json({ ids: updated?.favorites || [] });
  } catch (err) {
    console.error("removeFavorite error:", err);
    res.status(500).json({ message: "Server error removing favorite" });
  }
};

module.exports = { listFavorites, addFavorite, removeFavorite };
