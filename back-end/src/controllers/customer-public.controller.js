// ============================================================
// Customer Public Controller — worker/admin facing
// ============================================================
// Two endpoints under /api/customers/:id:
//   GET /api/customers/:id          — minimal profile + rating aggregates
//   GET /api/customers/:id/reviews  — paginated worker→customer reviews
// ============================================================

const mongoose = require("mongoose");
const User = require("../models/User.Model");
const Review = require("../models/Review");
const ServiceRequest = require("../models/Service.Request");
const { parsePagination, paginationMeta } = require("../lib/pagination");

const ensureWorkerOrAdmin = (req, res) => {
  const role = req.user?.role;
  if (role !== "worker" && role !== "admin") {
    res.status(403).json({ message: "هذه الصفحة مخصصة لمزودي الخدمة فقط" });
    return false;
  }
  return true;
};

const getCustomerById = async (req, res) => {
  try {
    if (!ensureWorkerOrAdmin(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Customer not found" });
    }
    const user = await User.findById(req.params.id).select(
      "firstName lastName profileImage createdAt role customerRatingAverage customerTotalReviews"
    );
    if (!user || user.role !== "customer") {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Order counts — single aggregation gives us both numbers in one round-trip.
    // We surface "completed" separately because workers care most about that
    // (it's the volume of finished business), and "total" includes every state
    // the customer has ever placed (pending, accepted, rejected, etc.).
    const counts = await ServiceRequest.aggregate([
      { $match: { customerId: new mongoose.Types.ObjectId(req.params.id) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
        },
      },
    ]);
    const totalOrders = counts[0]?.total || 0;
    const completedOrders = counts[0]?.completed || 0;

    res.json({
      customer: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
        customerRatingAverage: user.customerRatingAverage || 0,
        customerTotalReviews: user.customerTotalReviews || 0,
        totalOrders,
        completedOrders,
      },
    });
  } catch (err) {
    console.error("getCustomerById error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getCustomerReviews = async (req, res) => {
  try {
    if (!ensureWorkerOrAdmin(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Customer not found" });
    }
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 10, maxLimit: 50 });

    const filter = {
      customerId: req.params.id,
      direction: "worker_to_customer",
    };
    const total = await Review.countDocuments(filter);
    const reviews = await Review.find(filter)
      .populate("workerId", "firstName lastName profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ reviews, pagination: paginationMeta({ page, limit, total }) });
  } catch (err) {
    console.error("getCustomerReviews error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getCustomerById, getCustomerReviews };
