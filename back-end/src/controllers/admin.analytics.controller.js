// Admin analytics controller.
// All endpoints accept ?range=today|7d|30d|90d|all and use the shared
// dateRange helpers to build the time window. Aggregations run on the

const ServiceRequest = require("../models/Service.Request");
const Payment = require("../models/Payment");
const User = require("../models/User.Model");
const WorkerProfile = require("../models/Worker.Profile");
const Category = require("../models/Category");
const Coupon = require("../models/Coupon");
const SearchLog = require("../models/SearchLog");
const Report = require("../models/Reports");

const {
  getRangeDates,
  getRangeMatch,
  getDateBucketStage,
} = require("../utils/dateRange");

// ─── Group 1: Orders, Categories & Bestsellers ─────────────────────────

// GET /overview — top-line KPIs.
exports.getOverview = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const [agg] = await ServiceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "completed"] },
                { $ifNull: ["$proposedPrice", 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const totalOrders = agg?.totalOrders || 0;
    const completed = agg?.completed || 0;
    const cancelled = agg?.cancelled || 0;
    const revenue = agg?.revenue || 0;

    res.json({
      data: {
        totalOrders,
        completed,
        cancelled,
        cancellationRate: totalOrders ? cancelled / totalOrders : 0,
        avgOrderValue: completed ? revenue / completed : 0,
        revenue,
      },
    });
  } catch (err) {
    console.error("getOverview error:", err);
    res.status(500).json({ message: "Failed to load overview" });
  }
};

// GET /orders-trend — order counts grouped by time bucket for a line chart.
exports.getOrdersTrend = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const points = await ServiceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: getDateBucketStage(range),
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: "$_id", count: 1 } },
    ]);

    res.json({ data: points });
  } catch (err) {
    console.error("getOrdersTrend error:", err);
    res.status(500).json({ message: "Failed to load orders trend" });
  }
};

// GET /orders-status — status breakdown for a pie chart.
exports.getOrdersStatus = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const rows = await ServiceRequest.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $project: { _id: 0, status: "$_id", count: 1 } },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getOrdersStatus error:", err);
    res.status(500).json({ message: "Failed to load orders status" });
  }
};

// GET /top-categories — most-ordered categories with revenue.
exports.getTopCategories = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const rows = await ServiceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$categoryId",
          orderCount: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "completed"] },
                { $ifNull: ["$proposedPrice", 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { orderCount: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          categoryId: "$_id",
          name: { $ifNull: ["$category.name", "غير محدد"] },
          orderCount: 1,
          revenue: 1,
        },
      },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getTopCategories error:", err);
    res.status(500).json({ message: "Failed to load top categories" });
  }
};

// GET /top-services — top WorkerServices by order count + revenue.
exports.getTopServices = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const rows = await ServiceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$serviceId",
          orderCount: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "completed"] },
                { $ifNull: ["$proposedPrice", 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { orderCount: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "workerservices",
          localField: "_id",
          foreignField: "_id",
          as: "service",
        },
      },
      { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          serviceId: "$_id",
          name: { $ifNull: ["$service.name", "غير محدد"] },
          price: "$service.price",
          orderCount: 1,
          revenue: 1,
        },
      },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getTopServices error:", err);
    res.status(500).json({ message: "Failed to load top services" });
  }
};

// GET /top-workers — top workers by completed orders, earnings, and rating.
exports.getTopWorkers = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = { ...getRangeMatch(range), status: "completed", workerId: { $ne: null } };

    const rows = await ServiceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$workerId",
          completedOrders: { $sum: 1 },
          earnings: { $sum: { $ifNull: ["$proposedPrice", 0] } },
        },
      },
      { $sort: { completedOrders: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "workerprofiles",
          localField: "_id",
          foreignField: "userId",
          as: "profile",
        },
      },
      { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          workerId: "$_id",
          name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$user.firstName", ""] },
                  " ",
                  { $ifNull: ["$user.lastName", ""] },
                ],
              },
            },
          },
          rating: { $ifNull: ["$profile.ratingAverage", 0] },
          totalReviews: { $ifNull: ["$profile.totalReviews", 0] },
          completedOrders: 1,
          earnings: 1,
        },
      },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getTopWorkers error:", err);
    res.status(500).json({ message: "Failed to load top workers" });
  }
};

// GET /cancellation-reasons — most common cancellation reasons.
exports.getCancellationReasons = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = {
      ...getRangeMatch(range),
      status: "cancelled",
      "cancellationRequest.reason": { $exists: true, $nin: [null, ""] },
    };

    const rows = await ServiceRequest.aggregate([
      { $match: match },
      { $group: { _id: "$cancellationRequest.reason", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, reason: "$_id", count: 1 } },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getCancellationReasons error:", err);
    res.status(500).json({ message: "Failed to load cancellation reasons" });
  }
};

// ─── Group 2: Geography ────────────────────────────────────────────────

// GET /orders-by-governorate — orders + revenue per governorate.
// Falls back to "غير محدد" for legacy orders that have no governorate stored.
exports.getOrdersByGovernorate = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const rows = await ServiceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ["$location.governorate", "غير محدد"] },
          orderCount: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "completed"] },
                { $ifNull: ["$proposedPrice", 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { orderCount: -1 } },
      { $project: { _id: 0, governorate: "$_id", orderCount: 1, revenue: 1 } },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getOrdersByGovernorate error:", err);
    res.status(500).json({ message: "Failed to load orders by governorate" });
  }
};

// GET /orders-by-city — top 10 cities.
exports.getOrdersByCity = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const rows = await ServiceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ["$location.city", "غير محدد"] },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { orderCount: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, city: "$_id", orderCount: 1 } },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getOrdersByCity error:", err);
    res.status(500).json({ message: "Failed to load orders by city" });
  }
};

// GET /demand-supply-gap — orders vs active workers per governorate.
exports.getDemandSupplyGap = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const [demand, supply] = await Promise.all([
      ServiceRequest.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $ifNull: ["$location.governorate", "غير محدد"] },
            orders: { $sum: 1 },
          },
        },
      ]),
      WorkerProfile.aggregate([
        { $match: { verificationStatus: "approved" } },
        {
          $group: {
            _id: { $ifNull: ["$location.governorate", "غير محدد"] },
            workers: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Merge by governorate. We want every governorate that appears in either
    // dataset so admins can also spot governorates with workers but no demand.
    const map = new Map();
    for (const row of demand) {
      map.set(row._id, { governorate: row._id, orders: row.orders, workers: 0 });
    }
    for (const row of supply) {
      const existing = map.get(row._id);
      if (existing) existing.workers = row.workers;
      else map.set(row._id, { governorate: row._id, orders: 0, workers: row.workers });
    }

    const rows = Array.from(map.values())
      .map((r) => ({ ...r, gap: r.orders - r.workers }))
      .sort((a, b) => b.gap - a.gap);

    res.json({ data: rows });
  } catch (err) {
    console.error("getDemandSupplyGap error:", err);
    res.status(500).json({ message: "Failed to load demand-supply gap" });
  }
};

// ─── Group 3: Customers & Revenue ──────────────────────────────────────

// GET /top-customers — top spenders / orderers.
exports.getTopCustomers = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const rows = await ServiceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$customerId",
          orderCount: { $sum: 1 },
          spend: {
            $sum: {
              $cond: [
                { $eq: ["$status", "completed"] },
                { $ifNull: ["$proposedPrice", 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { spend: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          customerId: "$_id",
          name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$user.firstName", ""] },
                  " ",
                  { $ifNull: ["$user.lastName", ""] },
                ],
              },
            },
          },
          orderCount: 1,
          spend: 1,
        },
      },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getTopCustomers error:", err);
    res.status(500).json({ message: "Failed to load top customers" });
  }
};

// GET /customer-retention — new vs returning customers in the range.
// "new" = customer's FIRST order ever falls inside the range; "returning"
// = ordered in range AND had at least one earlier order before `from`.
exports.getCustomerRetention = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const { from, to } = getRangeDates(range);

    const inRangeMatch = from ? { createdAt: { $gte: from, $lte: to } } : {};

    // Customers with orders in the range, plus their FIRST-ever order date.
    const rows = await ServiceRequest.aggregate([
      { $match: inRangeMatch },
      { $group: { _id: "$customerId" } },
      {
        $lookup: {
          from: "servicerequests",
          let: { cid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$cid"] } } },
            { $sort: { createdAt: 1 } },
            { $limit: 1 },
            { $project: { _id: 0, createdAt: 1 } },
          ],
          as: "first",
        },
      },
      { $unwind: { path: "$first", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          firstAt: "$first.createdAt",
        },
      },
    ]);

    let newCount = 0;
    let returningCount = 0;
    for (const r of rows) {
      if (!from || (r.firstAt && r.firstAt >= from)) newCount++;
      else returningCount++;
    }

    res.json({ data: { new: newCount, returning: returningCount } });
  } catch (err) {
    console.error("getCustomerRetention error:", err);
    res.status(500).json({ message: "Failed to load customer retention" });
  }
};

// GET /revenue-trend — revenue over time (completed orders).
exports.getRevenueTrend = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = { ...getRangeMatch(range), status: "completed" };

    const points = await ServiceRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: getDateBucketStage(range),
          revenue: { $sum: { $ifNull: ["$proposedPrice", 0] } },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: "$_id", revenue: 1 } },
    ]);

    res.json({ data: points });
  } catch (err) {
    console.error("getRevenueTrend error:", err);
    res.status(500).json({ message: "Failed to load revenue trend" });
  }
};

// GET /revenue-split — platform fees vs worker earnings totals.
exports.getRevenueSplit = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = { ...getRangeMatch(range), status: "completed" };

    const [agg] = await Payment.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          platformFee: { $sum: { $ifNull: ["$platformFee", 0] } },
          workerEarnings: { $sum: { $ifNull: ["$workerEarnings", 0] } },
          total: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
    ]);

    res.json({
      data: {
        platformFee: agg?.platformFee || 0,
        workerEarnings: agg?.workerEarnings || 0,
        total: agg?.total || 0,
      },
    });
  } catch (err) {
    console.error("getRevenueSplit error:", err);
    res.status(500).json({ message: "Failed to load revenue split" });
  }
};

// GET /payment-methods — cash vs online distribution.
exports.getPaymentMethods = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const rows = await ServiceRequest.aggregate([
      { $match: match },
      { $group: { _id: "$paymentMode", count: { $sum: 1 } } },
      { $project: { _id: 0, mode: "$_id", count: 1 } },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getPaymentMethods error:", err);
    res.status(500).json({ message: "Failed to load payment methods" });
  }
};

// GET /refund-rate — refunded payments / completed payments.
exports.getRefundRate = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const [agg] = await Payment.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          completed: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          refunded: {
            $sum: { $cond: [{ $eq: ["$status", "refunded"] }, 1, 0] },
          },
        },
      },
    ]);

    const completed = agg?.completed || 0;
    const refunded = agg?.refunded || 0;

    res.json({
      data: {
        completed,
        refunded,
        rate: completed + refunded ? refunded / (completed + refunded) : 0,
      },
    });
  } catch (err) {
    console.error("getRefundRate error:", err);
    res.status(500).json({ message: "Failed to load refund rate" });
  }
};

// ─── Group 4: Marketing & Quality ──────────────────────────────────────

// GET /coupons — top coupons by usage and revenue.
exports.getCouponsAnalytics = async (req, res) => {
  try {
    const top = await Coupon.find({})
      .sort({ currentUses: -1 })
      .limit(10)
      .select("code description currentUses maxUses revenueGenerated discountType discountValue status expiresAt")
      .lean();

    const [agg] = await Coupon.aggregate([
      {
        $group: {
          _id: null,
          totalUses: { $sum: { $ifNull: ["$currentUses", 0] } },
          totalRevenue: { $sum: { $ifNull: ["$revenueGenerated", 0] } },
          activeCount: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
        },
      },
    ]);

    res.json({
      data: {
        totals: {
          totalUses: agg?.totalUses || 0,
          totalRevenue: agg?.totalRevenue || 0,
          activeCount: agg?.activeCount || 0,
        },
        top,
      },
    });
  } catch (err) {
    console.error("getCouponsAnalytics error:", err);
    res.status(500).json({ message: "Failed to load coupon analytics" });
  }
};

// GET /top-search-terms — top searched queries (last 30 days, TTL-bounded).
exports.getTopSearchTerms = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const rows = await SearchLog.aggregate([
      { $match: match },
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $project: { _id: 0, query: "$_id", count: 1 } },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getTopSearchTerms error:", err);
    res.status(500).json({ message: "Failed to load search terms" });
  }
};

// GET /reports-by-category — counts of reports grouped by reported worker's
// primary category. Customers being reported don't have a category, so they
// fall under "غير مصنف".
exports.getReportsByCategory = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = getRangeMatch(range);

    const rows = await Report.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "workerprofiles",
          localField: "reportedUser",
          foreignField: "userId",
          as: "profile",
        },
      },
      { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$profile.Category", null] },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: { $ifNull: ["$category.name", "غير مصنف"] },
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getReportsByCategory error:", err);
    res.status(500).json({ message: "Failed to load reports by category" });
  }
};

// GET /avg-completion-time — avg minutes between createdAt and completedAt
// per category. We use createdAt (not acceptedAt — there's no accepted
// timestamp on the schema) which represents "lead time from order to
// completion". Cancelled / non-completed orders are excluded.
exports.getAvgCompletionTime = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    const match = {
      ...getRangeMatch(range),
      status: "completed",
      completedAt: { $ne: null },
    };

    const rows = await ServiceRequest.aggregate([
      { $match: match },
      {
        $project: {
          categoryId: 1,
          // Difference in milliseconds → minutes.
          durationMin: {
            $divide: [
              { $subtract: ["$completedAt", "$createdAt"] },
              1000 * 60,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$categoryId",
          avgMinutes: { $avg: "$durationMin" },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          name: { $ifNull: ["$category.name", "غير محدد"] },
          avgMinutes: { $round: ["$avgMinutes", 1] },
          count: 1,
        },
      },
      { $sort: { avgMinutes: 1 } },
    ]);

    res.json({ data: rows });
  } catch (err) {
    console.error("getAvgCompletionTime error:", err);
    res.status(500).json({ message: "Failed to load avg completion time" });
  }
};
