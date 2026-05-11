const mongoose = require("mongoose");
const User = require("../models/User.Model");
const WorkerProfile = require("../models/Worker.Profile");
const WorkerServices = require("../models/Worker.Services");
const Report = require("../models/Reports");
const ServiceRequest = require("../models/Service.Request");
const Category = require("../models/Category");
const Notification = require("../models/Notification");
const { parsePagination, paginationMeta } = require("../lib/pagination");

const pendingVerificationFilter = {
  $or: [
    { verificationStatus: "pending" },
    { "license.status": "pending" },
  ],
};

// ============================================================
// GET /api/admin/stats
// ============================================================
// Returns platform-wide statistics for the admin dashboard cards.
const getStats = async (req, res) => {
  try {
    const [totalUsers, activeWorkers, openReports, salesResult, totalCategories] =
      await Promise.all([
        User.countDocuments(),
        WorkerProfile.countDocuments({ verificationStatus: "approved" }),
        Report.countDocuments({ status: "pending" }),
        ServiceRequest.aggregate([
          { $match: { status: "completed" } },
          { $group: { _id: null, total: { $sum: "$proposedPrice" } } },
        ]),
        Category.countDocuments({ isActive: true }),
      ]);

    const totalSales = salesResult.length > 0 ? salesResult[0].total : 0;

    res.json({
      stats: {
        totalUsers,
        activeWorkers,
        openReports,
        totalSales,
        totalCategories,
      },
    });
  } catch (error) {
    console.error("getStats error:", error);
    res.status(500).json({ message: "Server error fetching stats" });
  }
};

// ============================================================
// GET /api/admin/users?role=all|customer|worker&page=1&limit=10
// ============================================================
// Returns a paginated list of users for the admin management table.
// Admin can filter by role (all, customer, worker).
const getUsers = async (req, res) => {
  try {
    const { role = "all", page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const filter = {};
    if (role !== "all") {
      filter.role = role;
    }

    const total = await User.countDocuments(filter);

    const users = await User.find(filter)
      .select("firstName lastName email phone profileImage role status createdAt")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("getUsers error:", error);
    res.status(500).json({ message: "Server error fetching users" });
  }
};

// ============================================================
// GET /api/admin/users/:id
// ============================================================
// Returns full details of a single user for the admin details page.
// Includes: all user fields, customer/worker profile if exists, order count, reviews.
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Build response with additional data based on role
    const response = {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        role: user.role,
        bio: user.bio,
        location: user.location,
        status: user.status,
        isVerified: user.isVerified,
        notificationPreferences: user.notificationPreferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };

    // Get order stats for this user (as customer or worker)
    const [ordersAsCustomer, ordersAsWorker] = await Promise.all([
      ServiceRequest.countDocuments({ customerId: user._id }),
      ServiceRequest.countDocuments({ workerId: user._id }),
    ]);
    response.orderStats = { asCustomer: ordersAsCustomer, asWorker: ordersAsWorker };

    // Get recent orders (last 5)
    const recentOrders = await ServiceRequest.find({
      $or: [{ customerId: user._id }, { workerId: user._id }],
    })
      .populate("customerId", "firstName lastName")
      .populate("workerId", "firstName lastName")
      .populate("categoryId", "name")
      .sort({ createdAt: -1 })
      .limit(5);
    response.recentOrders = recentOrders;

    // If worker, get their worker profile
    if (user.role === "worker") {
      const WorkerProfile = require("../models/Worker.Profile");
      const workerProfile = await WorkerProfile.findOne({ userId: user._id })
        .populate("Category", "name")
        .populate({ path: "services", select: "description price typeofService active" });
      response.workerProfile = workerProfile;
    }

    // If customer, get their customer profile
    if (user.role === "customer") {
      const CustomerProfile = require("../models/Customer.Profile");
      const customerProfile = await CustomerProfile.findOne({ userId: user._id });
      response.customerProfile = customerProfile;
    }

    res.json(response);
  } catch (error) {
    console.error("getUserById error:", error);
    res.status(500).json({ message: "Server error fetching user details" });
  }
};

// ============================================================
// PUT /api/admin/users/:id/status
// ============================================================
// Admin can change a user's account status (active, suspended, banned).
// This is the primary moderation tool.
const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["active", "suspended", "banned"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    console.error("updateUserStatus error:", error);
    res.status(500).json({ message: "Server error updating user status" });
  }
};

// ============================================================
// GET /api/admin/verification-requests
// ============================================================
// Returns workers who are waiting for identity verification.
// Admin reviews their documents and approves or rejects.
const getVerificationRequests = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 5, maxLimit: 50 });

    const total = await WorkerProfile.countDocuments(pendingVerificationFilter);

    const rawRequests = await WorkerProfile.find(pendingVerificationFilter)
      .populate("userId", "firstName lastName profileImage email phone")
      .populate("Category", "name")
      .populate("serviceCategories", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const requests = rawRequests.map((request) => {
      const item = request.toObject();
      item.requestType = request.verificationStatus === "pending" ? "profile" : "license";
      return item;
    });

    res.json({
      requests,
      pagination: paginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("getVerificationRequests error:", error);
    res.status(500).json({ message: "Server error fetching verification requests" });
  }
};

// ============================================================
// PUT /api/admin/verification/:id
// ============================================================
// Admin approves or rejects a worker's verification request.
// :id is the WorkerProfile _id.
const handleVerification = async (req, res) => {
  try {
    const { action, target = "profile" } = req.body;

    if (!["approved", "rejected"].includes(action)) {
      return res.status(400).json({ message: "Invalid action. Use 'approved' or 'rejected'" });
    }

    const request = await WorkerProfile.findById(req.params.id).populate("userId", "firstName lastName profileImage email phone");

    if (!request) {
      return res.status(404).json({ message: "Verification request not found" });
    }

    if (target === "license") {
      if (!request.license || request.license.status !== "pending") {
        return res.status(400).json({ message: "No pending license request found" });
      }

      request.license.status = action;
      request.license.reviewedAt = new Date();
      request.license.rejectionReason = action === "rejected" ? "تم رفض الرخصة من قبل الإدارة" : "";
      request.documents = (request.documents || []).map((doc) =>
        doc.type === "license" ? { ...doc.toObject(), status: action } : doc
      );
    } else {
      request.verificationStatus = action;
      request.documents = (request.documents || []).map((doc) =>
        doc.status === "pending" ? { ...doc.toObject(), status: action } : doc
      );
      if (request.license?.status === "pending") {
        request.license.status = action;
        request.license.reviewedAt = new Date();
        request.license.rejectionReason = action === "rejected" ? "تم رفض الرخصة من قبل الإدارة" : "";
      }
    }

    await request.save();

    await Notification.create({
      userId: request.userId._id,
      title: target === "license" ? "مراجعة الرخصة المهنية" : "مراجعة ملف التحقق",
      message:
        target === "license"
          ? action === "approved"
            ? "تمت الموافقة على الرخصة المهنية الخاصة بك."
            : "تم رفض الرخصة المهنية الخاصة بك. يرجى مراجعة البيانات وإعادة الإرسال."
          : action === "approved"
            ? "تمت الموافقة على ملف التحقق الخاص بك."
            : "تم رفض ملف التحقق الخاص بك. يرجى مراجعة البيانات وإعادة الإرسال.",
      type: action === "approved" ? "success" : "warning",
      link: "/dashboard",
    });

    res.json({ request });
  } catch (error) {
    console.error("handleVerification error:", error);
    res.status(500).json({ message: "Server error handling verification" });
  }
};

// ============================================================
// GET /api/admin/reports?status=all|pending|reviewed|resolved&page=1&limit=10
// ============================================================
// Returns paginated reports/complaints for admin review.
const getReports = async (req, res) => {
  try {
    const { status = "all", page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const filter = {};
    if (status !== "all") {
      filter.status = status;
    }

    const total = await Report.countDocuments(filter);

    const reports = await Report.find(filter)
      .populate("reportedBy", "firstName lastName profileImage")
      .populate("reportedUser", "firstName lastName profileImage")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      reports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("getReports error:", error);
    res.status(500).json({ message: "Server error fetching reports" });
  }
};

// ============================================================
// PUT /api/admin/reports/:id
// ============================================================
// Admin updates a report's status (reviewed or resolved).
const updateReport = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["reviewed", "resolved"].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Use 'reviewed' or 'resolved'" });
    }

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
      .populate("reportedBy", "firstName lastName profileImage")
      .populate("reportedUser", "firstName lastName profileImage");

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    res.json({ report });
  } catch (error) {
    console.error("updateReport error:", error);
    res.status(500).json({ message: "Server error updating report" });
  }
};

// ============================================================
// GET /api/admin/orders?status=all&page=1&limit=10
// ============================================================
// Returns all platform orders for admin oversight.
// Admin can see every order across all customers and workers.
// Filterable by status, paginated, with full customer/worker/category details.
const getOrders = async (req, res) => {
  try {
    const { status = "all", page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const filter = {};
    if (status === "in_progress") {
      filter.status = { $in: ["pending", "accepted", "in_progress"] };
    } else if (status === "history") {
      filter.status = { $in: ["completed", "cancelled", "rejected"] };
    } else if (status !== "all") {
      filter.status = status;
    }

    const total = await ServiceRequest.countDocuments(filter);

    const orders = await ServiceRequest.find(filter)
      .populate("customerId", "firstName lastName profileImage email phone")
      .populate("workerId", "firstName lastName profileImage email phone")
      .populate("categoryId", "name")
      .populate("serviceId", "name images price typeofService priceRange")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("getOrders error:", error);
    res.status(500).json({ message: "Server error fetching orders" });
  }
};

// ============================================================
// PUT /api/admin/orders/:id/status
// ============================================================
// Admin can change an order's status (e.g., cancel a disputed order).
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["pending", "accepted", "rejected", "in_progress", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const order = await ServiceRequest.findByIdAndUpdate(
      req.params.id,
      { status, ...(status === "cancelled" && { cancelledBy: "admin" }) },
      { new: true }
    )
      .populate("customerId", "firstName lastName profileImage")
      .populate("workerId", "firstName lastName profileImage")
      .populate("categoryId", "name")
      .populate("serviceId", "name images price typeofService priceRange");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ order });
  } catch (error) {
    console.error("updateOrderStatus error:", error);
    res.status(500).json({ message: "Server error updating order" });
  }
};

// ============================================================
// GET /api/admin/pending-services?page=1&limit=10
// ============================================================
// Returns services waiting for admin approval.
// Workers submit services → they start as "pending" → admin reviews here.
const getPendingServices = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 10, maxLimit: 50 });

    const total = await WorkerServices.countDocuments({ approvalStatus: "pending" });

    const services = await WorkerServices.find({ approvalStatus: "pending" })
      .populate({
        path: "workerID",
        populate: { path: "userId", select: "firstName lastName profileImage" },
      })
      .populate("categoryId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      services,
      pagination: paginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("getPendingServices error:", error);
    res.status(500).json({ message: "Server error fetching pending services" });
  }
};

// ============================================================
// PUT /api/admin/services/:id/approve
// ============================================================
// Admin approves a service → active: true, approvalStatus: "approved"
// Creates a notification for the worker.
const approveService = async (req, res) => {
  try {
    const service = await WorkerServices.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: "approved", active: true },
      { new: true }
    ).populate("categoryId", "name");

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    // Find the worker's profile to send notification + auto-verify
    const workerProfile = await WorkerProfile.findById(service.workerID);
    if (workerProfile) {
      // Always ensure the worker is verified when a service is approved.
      // Without verificationStatus: "approved", the worker won't appear on
      // the public /services page (getWorkers filters by it).
      let needsSave = false;

      if (workerProfile.verificationStatus !== "approved") {
        workerProfile.verificationStatus = "approved";
        needsSave = true;
      }

      // Always update the worker's category to match the approved service,
      // so they show up under the correct category on the services page.
      if (service.categoryId) {
        const newCategoryId = service.categoryId._id || service.categoryId;
        if (!workerProfile.Category || workerProfile.Category.toString() !== newCategoryId.toString()) {
          workerProfile.Category = newCategoryId;
          needsSave = true;
        }
      }

      if (needsSave) {
        await workerProfile.save();
      }

      await Notification.create({
        userId: workerProfile.userId,
        title: "تمت الموافقة على خدمتك",
        message: `تمت الموافقة على خدمة "${service.description || 'خدمة جديدة'}" وهي الآن متاحة للعملاء.`,
        type: "success",
        link: "/dashboard",
      });
    }

    res.json({ service });
  } catch (error) {
    console.error("approveService error:", error);
    res.status(500).json({ message: "Server error approving service" });
  }
};

// ============================================================
// PUT /api/admin/services/:id/reject
// ============================================================
// Admin rejects a service → approvalStatus: "rejected", active stays false
// Creates a notification for the worker with the reason.
const rejectService = async (req, res) => {
  try {
    const { reason } = req.body;

    const service = await WorkerServices.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: "rejected", active: false, rejectionReason: reason || "" },
      { new: true }
    ).populate("categoryId", "name");

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    // Notify the worker about the rejection
    const workerProfile = await WorkerProfile.findById(service.workerID);
    if (workerProfile) {
      await Notification.create({
        userId: workerProfile.userId,
        title: "تم رفض خدمتك",
        message: `تم رفض خدمة "${service.description || 'خدمة'}".${reason ? ` السبب: ${reason}` : ''} يمكنك تعديلها وإعادة تقديمها.`,
        type: "error",
        link: "/dashboard",
      });
    }

    res.json({ service });
  } catch (error) {
    console.error("rejectService error:", error);
    res.status(500).json({ message: "Server error rejecting service" });
  }
};

// ============================================================
// LICENSES — admin-side review queue + approve/reject
// ============================================================
// The worker submits multi-license entries (training, professional, …)
// from /worker/licenses. Each enters as "pending" and waits here.
// Admin verdict mirrors the services flow: notification + status change +
// optional rejection reason. Worker then flips `active` themselves.

// GET /api/admin/licenses?status=pending&page=1&limit=20
// Defaults to pending. Returns one row per LICENSE (not per profile), with
// the parent profile + user context the reviewer needs to make a decision.
const getLicenses = async (req, res) => {
  try {
    const status = ["pending", "approved", "rejected"].includes(req.query.status)
      ? req.query.status
      : "pending";
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 20, maxLimit: 100 });

    // Aggregation: unwind licenses → match status → join the user → project
    // a flat row per license. Doing this in Mongo (instead of fetching all
    // profiles client-side) keeps the queue fast as the platform grows.

    const pipeline = [
      { $match: { "licenses.status": status } },
      { $unwind: "$licenses" },
      { $match: { "licenses.status": status } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          workerProfileId: "$_id",
          workerUserId: "$user._id",
          workerName: { $concat: ["$user.firstName", " ", "$user.lastName"] },
          workerProfileImage: "$user.profileImage",
          license: "$licenses",
        },
      },
      { $sort: { "license.submittedAt": -1 } },
    ];

    // Count first (separate query — fast, just a $match + $unwind + $count).
    const countPipeline = [
      { $match: { "licenses.status": status } },
      { $unwind: "$licenses" },
      { $match: { "licenses.status": status } },
      { $count: "total" },
    ];

    const [items, countResult] = await Promise.all([
      WorkerProfile.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
      WorkerProfile.aggregate(countPipeline),
    ]);

    const total = countResult[0]?.total || 0;
    res.json({
      licenses: items,
      pagination: paginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("getLicenses error:", error);
    res.status(500).json({ message: "Server error fetching licenses" });
  }
};

// PUT /api/admin/licenses/:licenseId/approve
// Locates the parent profile by sub-doc id, flips status, notifies worker.
// Note: we don't auto-activate — the worker chooses when to surface it.
const approveLicense = async (req, res) => {
  try {
    const { licenseId } = req.params;

    const profile = await WorkerProfile.findOne({ "licenses._id": licenseId });
    if (!profile) {
      return res.status(404).json({ message: "License not found" });
    }
    const license = profile.licenses.id(licenseId);
    if (!license) {
      return res.status(404).json({ message: "License not found" });
    }

    license.status = "approved";
    license.rejectionReason = "";
    license.reviewedAt = new Date();
    await profile.save();

    await Notification.create({
      userId: profile.userId,
      title: "تمت الموافقة على الرخصة",
      message: `تمت الموافقة على رخصة "${license.name}". يمكنك تفعيلها الآن من ملفك الشخصي.`,
      type: "success",
      link: "/dashboard",
    });

    res.json({ license });
  } catch (error) {
    console.error("approveLicense error:", error);
    res.status(500).json({ message: "Server error approving license" });
  }
};

// PUT /api/admin/licenses/:licenseId/reject
// Body: { reason } — optional explanation surfaced to the worker.
const rejectLicense = async (req, res) => {
  try {
    const { licenseId } = req.params;
    const { reason } = req.body;

    const profile = await WorkerProfile.findOne({ "licenses._id": licenseId });
    if (!profile) {
      return res.status(404).json({ message: "License not found" });
    }
    const license = profile.licenses.id(licenseId);
    if (!license) {
      return res.status(404).json({ message: "License not found" });
    }

    license.status = "rejected";
    license.rejectionReason = String(reason || "").trim();
    license.active = false; // a previously-approved license being re-rejected shouldn't keep showing
    license.reviewedAt = new Date();
    await profile.save();

    await Notification.create({
      userId: profile.userId,
      title: "تم رفض الرخصة",
      message: `تم رفض رخصة "${license.name}".${reason ? ` السبب: ${reason}` : ""} يمكنك تعديلها وإعادة تقديمها.`,
      type: "error",
      link: "/dashboard",
    });

    res.json({ license });
  } catch (error) {
    console.error("rejectLicense error:", error);
    res.status(500).json({ message: "Server error rejecting license" });
  }
};

module.exports = {
  getStats,
  getUsers,
  getUserById,
  updateUserStatus,
  getVerificationRequests,
  handleVerification,
  getReports,
  updateReport,
  getOrders,
  updateOrderStatus,
  getPendingServices,
  approveService,
  rejectService,
  getLicenses,
  approveLicense,
  rejectLicense,
};
