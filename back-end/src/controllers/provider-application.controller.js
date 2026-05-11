const mongoose = require("mongoose");
const ProviderApplication = require("../models/ProviderApplication");
const User = require("../models/User.Model");
const WorkerProfile = require("../models/Worker.Profile");
const WorkerServices = require("../models/Worker.Services");
const Category = require("../models/Category");
const Notification = require("../models/Notification");

// ============================================================
// POST /api/provider-applications
// ============================================================
// Customer submits an application to become a service provider.
//
// Rules:
//   - Caller must be role === "customer". Workers and admins can't apply.
//   - One open (pending or approved) application per user — the unique index
//     on the model enforces it; we surface a friendly message here.
//   - bio is required and must be at least 10 chars (trimmed).
//   - category must be a real Category id.
//   - proposedServices is optional; each entry needs a name. Files (images,
//     pdfs) are passed as already-uploaded Cloudinary URLs.
const submitApplication = async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        message: "فقط العملاء يمكنهم التقديم لتصبح مزوّد خدمة",
      });
    }

    const { bio, category, proposedServices } = req.body || {};

    const trimmedBio = String(bio || "").trim();
    if (trimmedBio.length < 10) {
      return res.status(400).json({
        message: "نبذة عن خبرتك مطلوبة (10 أحرف على الأقل)",
      });
    }

    if (!category || !mongoose.isValidObjectId(category)) {
      return res.status(400).json({ message: "اختر فئة عملك" });
    }
    const categoryDoc = await Category.findById(category).select("_id");
    if (!categoryDoc) {
      return res.status(400).json({ message: "الفئة المختارة غير موجودة" });
    }

    // Duplicate-application check (covers the brief race between unique-index
    // failures and our own message).
    const existing = await ProviderApplication.findOne({
      userId: req.user._id,
      status: { $in: ["pending", "approved"] },
    });
    if (existing) {
      return res.status(409).json({
        message:
          existing.status === "pending"
            ? "لديك طلب قيد المراجعة بالفعل"
            : "لقد تم قبولك بالفعل كمزوّد خدمة",
        application: existing,
      });
    }

    // Normalize proposed services — keep only entries with a name.
    const services = Array.isArray(proposedServices)
      ? proposedServices
          .map((s) => ({
            name: String(s?.name || "").trim(),
            description: String(s?.description || "").trim(),
            price: Number(s?.price) || 0,
            typeofService: ["hourly", "fixed", "range"].includes(s?.typeofService)
              ? s.typeofService
              : "fixed",
            priceRange:
              s?.priceRange && typeof s.priceRange === "object"
                ? {
                    min: Number(s.priceRange.min) || undefined,
                    max: Number(s.priceRange.max) || undefined,
                  }
                : undefined,
            images: Array.isArray(s?.images)
              ? s.images.map((u) => String(u || "").trim()).filter(Boolean)
              : [],
            pdfs: Array.isArray(s?.pdfs)
              ? s.pdfs.map((u) => String(u || "").trim()).filter(Boolean)
              : [],
          }))
          .filter((s) => s.name)
      : [];

    const application = await ProviderApplication.create({
      userId: req.user._id,
      bio: trimmedBio,
      category,
      proposedServices: services,
      status: "pending",
      submittedAt: new Date(),
    });

    // Notify all admins so the queue badge updates immediately.
    (async () => {
      try {
        const admins = await User.find({ role: "admin" }).select("_id");
        if (admins.length > 0) {
          const userName =
            `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() ||
            "مستخدم";
          await Notification.insertMany(
            admins.map((a) => ({
              userId: a._id,
              title: "طلب انضمام جديد كمزوّد خدمة",
              message: `قام ${userName} بتقديم طلب لينضم كمزوّد خدمة، بانتظار مراجعتك.`,
              type: "info",
              link: "/admin",
            }))
          );
        }
      } catch (notifErr) {
        console.error("Failed to notify admins (provider application):", notifErr);
      }
    })();

    res.status(201).json({ application });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "لديك طلب قيد المراجعة أو مقبول بالفعل",
      });
    }
    console.error("submitApplication error:", error);
    res.status(500).json({ message: "خطأ في الخادم أثناء إرسال الطلب" });
  }
};

// GET /api/provider-applications/me — current user's latest application
const getMyApplication = async (req, res) => {
  try {
    // Newest first so a customer who was rejected and re-applied sees the
    // pending row, not the old rejection.
    const application = await ProviderApplication.findOne({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("category", "name image");
    res.json({ application: application || null });
  } catch (error) {
    console.error("getMyApplication error:", error);
    res.status(500).json({ message: "خطأ في الخادم" });
  }
};

// GET /api/provider-applications  — admin queue
// Query params: status (pending | approved | rejected | all)
const listApplications = async (req, res) => {
  try {
    const status = req.query.status;
    const filter = {};
    if (status && status !== "all") {
      filter.status = status;
    }
    const applications = await ProviderApplication.find(filter)
      .sort({ createdAt: -1 })
      .populate("userId", "firstName lastName email phone profileImage")
      .populate("category", "name image")
      .populate("reviewedBy", "firstName lastName");
    res.json({ applications });
  } catch (error) {
    console.error("listApplications error:", error);
    res.status(500).json({ message: "خطأ في الخادم" });
  }
};

// PUT /api/provider-applications/:id/approve
// On approve: flip user role, create WorkerProfile + services, notify.
const approveApplication = async (req, res) => {
  try {
    const application = await ProviderApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ message: "الطلب غير موجود" });
    }
    if (application.status !== "pending") {
      return res.status(400).json({ message: "تم البتّ في هذا الطلب من قبل" });
    }

    const user = await User.findById(application.userId);
    if (!user) {
      return res.status(404).json({ message: "المستخدم غير موجود" });
    }

    // 1) Flip role to worker.
    user.role = "worker";
    if (!user.bio && application.bio) user.bio = application.bio;
    await user.save();

    // 2) Create or upgrade the WorkerProfile.
    // If a profile already exists (rare but possible if data was inconsistent),
    // we update it rather than creating a duplicate.
    let profile = await WorkerProfile.findOne({ userId: user._id });
    if (!profile) {
      profile = await WorkerProfile.create({
        userId: user._id,
        Category: application.category,
        serviceCategories: [application.category],
        verificationStatus: "approved",
        singleCategoryEnforced: true,
      });
    } else {
      profile.Category = application.category;
      // Replace serviceCategories with just the locked category — single-cat
      // enforcement means no other categories should remain.
      profile.serviceCategories = [application.category];
      profile.verificationStatus = "approved";
      profile.singleCategoryEnforced = true;
      await profile.save();
    }

    // 3) Auto-create the proposed services as approved + active so they show
    // on /services right away, per product spec.
    const created = [];
    for (const s of application.proposedServices || []) {
      if (!s?.name) continue;
      const svc = await WorkerServices.create({
        workerID: profile._id,
        categoryId: application.category,
        name: s.name,
        description: s.description || "",
        images: Array.isArray(s.images) ? s.images.filter(Boolean) : [],
        price: Number(s.price) || 0,
        typeofService: s.typeofService || "fixed",
        priceRange: s.priceRange || undefined,
        active: true,
        approvalStatus: "approved",
      });
      created.push(svc._id);
    }
    if (created.length > 0) {
      profile.services = [...(profile.services || []), ...created];
      await profile.save();
    }

    // 4) Mark application approved.
    application.status = "approved";
    application.reviewedAt = new Date();
    application.reviewedBy = req.user._id;
    application.rejectionReason = "";
    await application.save();

    // 5) Notify the user.
    await Notification.create({
      userId: user._id,
      title: "تم قبول طلبك",
      message: "تهانينا! تم قبولك كمزوّد خدمة. يمكنك الآن إدارة خدماتك.",
      type: "success",
      link: "/dashboard",
    });

    res.json({ application, profileId: profile._id, servicesCreated: created.length });
  } catch (error) {
    console.error("approveApplication error:", error);
    res.status(500).json({ message: "خطأ في الخادم أثناء الموافقة" });
  }
};

// PUT /api/provider-applications/:id/reject  { rejectionReason }
const rejectApplication = async (req, res) => {
  try {
    const { rejectionReason } = req.body || {};
    const reason = String(rejectionReason || "").trim();

    const application = await ProviderApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ message: "الطلب غير موجود" });
    }
    if (application.status !== "pending") {
      return res.status(400).json({ message: "تم البتّ في هذا الطلب من قبل" });
    }

    application.status = "rejected";
    application.rejectionReason = reason;
    application.reviewedAt = new Date();
    application.reviewedBy = req.user._id;
    await application.save();

    await Notification.create({
      userId: application.userId,
      title: "تم رفض طلب الانضمام",
      message: reason
        ? `للأسف تم رفض طلبك. السبب: ${reason}`
        : "للأسف تم رفض طلب الانضمام كمزوّد خدمة.",
      type: "warning",
      link: "/become-provider",
    });

    res.json({ application });
  } catch (error) {
    console.error("rejectApplication error:", error);
    res.status(500).json({ message: "خطأ في الخادم أثناء الرفض" });
  }
};

module.exports = {
  submitApplication,
  getMyApplication,
  listApplications,
  approveApplication,
  rejectApplication,
};
