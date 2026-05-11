const Coupon = require("../models/Coupon");

// ============================================================
// Helper: augment a coupon with derived fields the UI needs.
// ============================================================
// `status` on disk only stores admin actions (active/paused).
// The UI also needs to distinguish "expired" (time-based or usage-based).
// We compute an effective status here so frontends don't duplicate the logic.
const deriveStatus = (coupon) => {
  const now = new Date();
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) return "expired";
  if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) return "expired";
  return coupon.status; // "active" | "paused"
};

// ============================================================
// GET /api/admin/coupons?status=all|active|paused|expired&search=&sort=newest
// ============================================================
// Lists all coupons for the admin table. Supports status filter tab,
// free-text search against code or description, and sort order.
// ============================================================
const listCoupons = async (req, res) => {
  try {
    const { status = "all", search = "", sort = "newest" } = req.query;

    // Build a MongoDB filter. Expiry is derived so "expired" requires
    // a different query shape — we post-filter after fetching.
    const filter = {};
    if (search) {
      // Escape regex chars, case-insensitive match on code or description
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(safe, "i");
      filter.$or = [{ code: pattern }, { description: pattern }];
    }

    // Admin-flag-based filtering; "expired" is handled below.
    if (status === "active" || status === "paused") {
      filter.status = status;
    }

    let sortObj = { createdAt: -1 };
    if (sort === "oldest") sortObj = { createdAt: 1 };
    if (sort === "mostUsed") sortObj = { currentUses: -1 };

    const coupons = await Coupon.find(filter)
      .populate("applicableCategories", "name")
      .sort(sortObj)
      .lean();

    // Add derived status then apply the "expired" filter client-side if requested.
    const withStatus = coupons.map(c => ({ ...c, effectiveStatus: deriveStatus(c) }));
    const filtered = status === "expired"
      ? withStatus.filter(c => c.effectiveStatus === "expired")
      : status === "active"
        ? withStatus.filter(c => c.effectiveStatus === "active")   // exclude expired-but-active
        : withStatus;

    res.json({ coupons: filtered });
  } catch (error) {
    console.error("listCoupons error:", error);
    res.status(500).json({ message: "Server error listing coupons" });
  }
};

// ============================================================
// GET /api/admin/coupons/stats
// ============================================================
// Powers the 4 KPI cards at the top of the admin page:
//   - active coupons count
//   - total uses across all coupons
//   - total revenue generated
//   - average discount %
// ============================================================
const getStats = async (req, res) => {
  try {
    const all = await Coupon.find({}).lean();
    const now = new Date();

    // An "active" coupon here means admin-active AND not time/use expired.
    const activeCount = all.filter(c => {
      if (c.status !== "active") return false;
      if (c.expiresAt && new Date(c.expiresAt) < now) return false;
      if (c.maxUses && c.currentUses >= c.maxUses) return false;
      return true;
    }).length;

    const totalUses = all.reduce((sum, c) => sum + (c.currentUses || 0), 0);
    const totalRevenue = all.reduce((sum, c) => sum + (c.revenueGenerated || 0), 0);

    // Average discount — we only average percentage-type coupons, so the
    // metric is comparable. Fixed-amount coupons would skew this.
    const percentageCoupons = all.filter(c => c.discountType === "percentage");
    const avgDiscount = percentageCoupons.length > 0
      ? Math.round(percentageCoupons.reduce((s, c) => s + (c.discountValue || 0), 0) / percentageCoupons.length)
      : 0;

    res.json({
      activeCount,
      totalUses,
      totalRevenue,
      avgDiscount,
    });
  } catch (error) {
    console.error("getStats error:", error);
    res.status(500).json({ message: "Server error fetching coupon stats" });
  }
};

// ============================================================
// POST /api/admin/coupons
// ============================================================
const createCoupon = async (req, res) => {
  try {
    const {
      code, description,
      discountType, discountValue,
      applicableCategories, minOrderAmount,
      maxUses, expiresAt, status,
      showOnHomePage, bannerImage, bannerTitle, bannerSubtitle, bannerCtaLabel,
    } = req.body;

    if (!code || !code.trim()) return res.status(400).json({ message: "Code is required" });
    if (discountValue === undefined || discountValue === null) {
      return res.status(400).json({ message: "Discount value is required" });
    }
    if (!expiresAt) return res.status(400).json({ message: "Expiration date is required" });

    // Only one coupon should drive the home banner at a time — if the admin
    // flags this one as featured, unflag the others.
    if (showOnHomePage) {
      await Coupon.updateMany({ showOnHomePage: true }, { showOnHomePage: false });
    }

    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      description,
      discountType,
      discountValue,
      applicableCategories: Array.isArray(applicableCategories) ? applicableCategories : [],
      minOrderAmount: minOrderAmount || 0,
      maxUses: maxUses || 0,
      expiresAt,
      status: status || "active",
      showOnHomePage: !!showOnHomePage,
      bannerImage: bannerImage || "",
      bannerTitle: bannerTitle || "",
      bannerSubtitle: bannerSubtitle || "",
      bannerCtaLabel: bannerCtaLabel || "استفد من العرض",
    });

    res.status(201).json({ coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "هذا الكود موجود بالفعل" });
    }
    console.error("createCoupon error:", error);
    res.status(500).json({ message: "Server error creating coupon" });
  }
};

// ============================================================
// PUT /api/admin/coupons/:id
// ============================================================
const updateCoupon = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.code) updates.code = String(updates.code).trim().toUpperCase();

    // Same exclusivity rule as create — only one home-banner coupon at a time.
    if (updates.showOnHomePage === true) {
      await Coupon.updateMany(
        { showOnHomePage: true, _id: { $ne: req.params.id } },
        { showOnHomePage: false },
      );
    }

    const coupon = await Coupon.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate("applicableCategories", "name");

    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json({ coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "هذا الكود موجود بالفعل" });
    }
    console.error("updateCoupon error:", error);
    res.status(500).json({ message: "Server error updating coupon" });
  }
};

// ============================================================
// DELETE /api/admin/coupons/:id
// ============================================================
const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json({ ok: true });
  } catch (error) {
    console.error("deleteCoupon error:", error);
    res.status(500).json({ message: "Server error deleting coupon" });
  }
};

// ============================================================
// GET /api/coupons/featured  (public — for the home page banner)
// ============================================================
// Returns the one coupon that's flagged as the home-page feature AND still
// active (not paused, not expired, not exhausted). Returns 204 if none.
const getFeatured = async (req, res) => {
  try {
    const now = new Date();
    const candidate = await Coupon.findOne({
      showOnHomePage: true,
      status: "active",
      expiresAt: { $gt: now },
    }).populate("applicableCategories", "name").lean();

    // Return { coupon: null } instead of 204 so the fetch helper can parse
    // the response consistently. Frontend just checks the truthiness.
    if (!candidate) return res.json({ coupon: null });
    if (candidate.maxUses && candidate.currentUses >= candidate.maxUses) {
      return res.json({ coupon: null });
    }

    res.json({ coupon: candidate });
  } catch (error) {
    console.error("getFeatured error:", error);
    res.status(500).json({ message: "Server error fetching featured coupon" });
  }
};

// ============================================================
// Internal helper — shared by POST /validate and order.controller.createOrder
// ============================================================
// Returns { valid: true, discount, coupon } or { valid: false, message }.
// Never throws — always a structured result so callers can branch cleanly.
// ============================================================
const validateCouponInternal = async (code, categoryId, amount) => {
  if (!code) return { valid: false, message: "يرجى إدخال كود الخصم" };
  const normalized = String(code).trim().toUpperCase();
  if (!normalized) return { valid: false, message: "يرجى إدخال كود الخصم" };

  const coupon = await Coupon.findOne({ code: normalized });
  if (!coupon) return { valid: false, message: "الكود غير صالح" };

  // Admin-paused coupons are off regardless of expiry.
  if (coupon.status === "paused") {
    return { valid: false, message: "هذا الكود موقوف حالياً" };
  }
  // Time expiry.
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, message: "انتهت صلاحية هذا الكود" };
  }
  // Usage cap (0 means unlimited — matches admin UI convention).
  if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
    return { valid: false, message: "تم استنفاد عدد مرات استخدام هذا الكود" };
  }
  // Minimum order amount.
  if (coupon.minOrderAmount && amount < coupon.minOrderAmount) {
    return {
      valid: false,
      message: `الحد الأدنى للطلب لاستخدام هذا الكود هو ${coupon.minOrderAmount} ج.م`,
    };
  }
  // Category scope — empty array means "all categories".
  if (Array.isArray(coupon.applicableCategories) && coupon.applicableCategories.length > 0) {
    const allowed = coupon.applicableCategories.map((c) => String(c));
    if (!categoryId || !allowed.includes(String(categoryId))) {
      return { valid: false, message: "هذا الكود غير صالح لفئة الخدمة المحددة" };
    }
  }

  // Compute discount. Cap it at the order amount so we never produce a
  // negative total.
  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = Math.round((amount * coupon.discountValue) / 100);
  } else {
    discount = Number(coupon.discountValue) || 0;
  }
  discount = Math.min(discount, amount);

  return { valid: true, discount, coupon };
};

// ============================================================
// POST /api/coupons/validate
// ============================================================
const validate = async (req, res) => {
  try {
    const { code, categoryId, amount } = req.body || {};
    const result = await validateCouponInternal(code, categoryId, Number(amount) || 0);
    // Strip internal Mongoose doc from the response — only expose what the UI needs.
    if (result.valid) {
      return res.json({
        valid: true,
        discount: result.discount,
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        discountValue: result.coupon.discountValue,
      });
    }
    return res.json({ valid: false, message: result.message });
  } catch (err) {
    console.error("validate coupon error:", err);
    res.status(500).json({ valid: false, message: "خطأ في التحقق من الكود" });
  }
};

module.exports = {
  listCoupons,
  getStats,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getFeatured,
  validate,
  validateCouponInternal,
};
