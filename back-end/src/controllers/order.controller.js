// ============================================================
// Order Controller
// ============================================================
// Handles customer-side order creation and worker-side status updates.
// ============================================================
const ServiceRequest = require("../models/Service.Request");
const WorkerServices = require("../models/Worker.Services");
const Notification = require("../models/Notification");
const Coupon = require("../models/Coupon");
const WorkerProfile = require("../models/Worker.Profile");
const WalletTransaction = require("../models/Wallet.Transaction");
const { validateCouponInternal } = require("./coupon.controller");
const { computeRank } = require("../lib/rank");

// Helper: emit notification:new over Socket.IO to a specific user's room.
const emitNotification = (req, userId, notification) => {
  try {
    const io = req.app.get("io");
    if (!io) return;
    io.to(`user:${String(userId)}`).emit("notification:new", notification);
  } catch (err) {
    console.error("emitNotification error:", err);
  }
};

// Helper: resolve the numeric base price a service charges.
const resolveServicePrice = (service) => {
  if (service.typeofService === "range" && service.priceRange?.min) {
    return Number(service.priceRange.min);
  }
  return Number(service.price || 0);
};

// ============================================================
// POST /api/customer/orders
// ============================================================
// Body: { serviceId, scheduledDate, address, notes?, paymentMode, couponCode? }
// Creates a ServiceRequest with status=pending and notifies the worker.
//
// Payment handling:
//   - cash_on_delivery: no Payment doc. Money changes hands offline at
//     completion. ServiceRequest.payment stays null.
//   - card: BLOCKED for now — returns 400. Placeholder until a real
// ============================================================
const createOrder = async (req, res) => {
  try {
    const {
      serviceId,
      scheduledDate,
      address,
      lat,
      lng,
      notes,
      paymentMode = "cash_on_delivery",
      couponCode,
    } = req.body || {};

    if (!serviceId) {
      return res.status(400).json({ message: "يرجى تحديد الخدمة" });
    }
    if (!scheduledDate) {
      return res.status(400).json({ message: "يرجى تحديد موعد الخدمة" });
    }
    if (!address || !String(address).trim()) {
      return res.status(400).json({ message: "يرجى إدخال عنوان الخدمة" });
    }
    // Coords are optional, but if present they must be in the legal range.
    let pickedLat, pickedLng;
    if (lat !== undefined || lng !== undefined) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)
          && latNum >= -90 && latNum <= 90
          && lngNum >= -180 && lngNum <= 180) {
        pickedLat = latNum;
        pickedLng = lngNum;
      }
    }
    if (paymentMode === "card") {
      return res.status(400).json({
        message: "الدفع بالبطاقة غير متاح حالياً، يرجى اختيار الدفع عند الاستلام",
      });
    }
    if (!["cash_on_delivery"].includes(paymentMode)) {
      return res.status(400).json({ message: "طريقة دفع غير صالحة" });
    }

    // Load service + its worker profile so we can resolve the worker's User id.
    const service = await WorkerServices.findById(serviceId)
      .populate({ path: "workerID", select: "userId" })
      .populate({ path: "categoryId", select: "name" });

    if (!service) {
      return res.status(404).json({ message: "الخدمة غير موجودة" });
    }
    if (!service.active || service.approvalStatus !== "approved") {
      return res.status(400).json({ message: "الخدمة غير متاحة حالياً" });
    }
    if (!service.workerID?.userId) {
      return res.status(500).json({ message: "تعذر العثور على بيانات مقدم الخدمة" });
    }

    const workerUserId = service.workerID.userId;

    // Security: prevent a customer from ordering from themselves.
    if (String(workerUserId) === String(req.user._id)) {
      return res.status(400).json({ message: "لا يمكنك طلب خدمتك الخاصة" });
    }

    // Compute base + coupon discount. We validate the coupon server-side even
    // though the frontend already validated — clients can't be trusted for
    // money math.
    const basePrice = resolveServicePrice(service);
    let discountAmount = 0;
    let appliedCouponCode = null;
    let couponDoc = null;

    if (couponCode && String(couponCode).trim()) {
      const result = await validateCouponInternal(
        String(couponCode).trim().toUpperCase(),
        service.categoryId?._id || service.categoryId,
        basePrice,
      );
      if (!result.valid) {
        return res.status(400).json({ message: result.message });
      }
      discountAmount = result.discount;
      appliedCouponCode = result.coupon.code;
      couponDoc = result.coupon;
    }

    const finalPrice = Math.max(0, basePrice - discountAmount);

    const order = await ServiceRequest.create({
      customerId: req.user._id,
      workerId: workerUserId,
      serviceId: service._id,
      categoryId: service.categoryId?._id || service.categoryId,
      description: (notes || "").trim(),
      location: {
        address: String(address).trim(),
        // Spread the coords only when both are valid — keeps the doc clean
        // when the customer skipped the map picker.
        ...(pickedLat !== undefined && pickedLng !== undefined
          ? { lat: pickedLat, lng: pickedLng }
          : {}),
      },
      proposedPrice: finalPrice,
      paymentMode,
      couponCode: appliedCouponCode,
      discountAmount,
      scheduledDate: new Date(scheduledDate),
      status: "pending",
    });

    // Increment coupon usage counters AFTER order is successfully created.
    // If the order save fails, the coupon counter stays untouched.
    if (couponDoc) {
      await Coupon.findByIdAndUpdate(couponDoc._id, {
        $inc: {
          currentUses: 1,
          revenueGenerated: finalPrice,
        },
      });
    }

    // Notify the worker. Reuses the 24h TTL Notification model — no new
    // infrastructure.
    const customerName = `${req.user.firstName} ${req.user.lastName}`.trim();
    const notification = await Notification.create({
      userId: workerUserId,
      title: "طلب خدمة جديد",
      message: `طلب من ${customerName} لخدمة: ${service.name}`,
      type: "info",
      link: "/dashboard",
    });

    // Fire-and-forget socket emit so the worker's bell updates live.
    emitNotification(req, workerUserId, notification);

    // Return the fully populated order so the frontend can immediately
    // render it without a second fetch.
    const populated = await ServiceRequest.findById(order._id)
      .populate("workerId", "firstName lastName profileImage")
      .populate("customerId", "firstName lastName profileImage")
      .populate("categoryId", "name")
      .populate("serviceId", "name images price typeofService priceRange");

    res.status(201).json({ order: populated });
  } catch (err) {
    console.error("createOrder error:", err);
    res.status(500).json({ message: "خطأ في إنشاء الطلب" });
  }
};

// ============================================================
// PUT /api/worker/orders/:id/status
// ============================================================
// Worker accept/reject/progress/complete transitions.
// Only the assigned worker can move their own orders.
//
// Allowed transitions:
//   pending   → accepted | rejected
//   accepted  → in_progress | cancelled
//   in_progress → completed
// Any other transition is rejected with 400 to keep the state machine honest.
// ============================================================
const LEGAL_TRANSITIONS = {
  pending: ["accepted", "rejected"],
  accepted: ["in_progress", "cancelled"],
  in_progress: ["completed"],
};

const updateOrderStatusByWorker = async (req, res) => {
  try {
    const { status, rejectionReason, completionReport } = req.body || {};
    if (!status) return res.status(400).json({ message: "الحالة مطلوبة" });

    const order = await ServiceRequest.findById(req.params.id)
      .populate("serviceId", "name")
      .populate("customerId", "firstName lastName");

    if (!order) return res.status(404).json({ message: "الطلب غير موجود" });

    // Ownership check — only the worker on this order can act on it.
    if (!order.workerId || String(order.workerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "غير مصرح" });
    }

    const legal = LEGAL_TRANSITIONS[order.status] || [];
    if (!legal.includes(status)) {
      return res.status(400).json({
        message: `لا يمكن الانتقال من الحالة "${order.status}" إلى "${status}"`,
      });
    }

    // Completion gate: the in_progress → completed transition is the "proof
    // of work" handoff. We require the worker to submit details + at least
    // one image so the customer (and any later dispute) has evidence the job
    // was actually done. Any other transition ignores the field entirely.
    if (status === "completed") {
      const details = String(completionReport?.details || "").trim();
      const images = Array.isArray(completionReport?.images)
        ? completionReport.images.filter((u) => typeof u === "string" && u.trim())
        : [];
      if (!details) {
        return res.status(400).json({ message: "يرجى كتابة تفاصيل العمل المنجز" });
      }
      if (images.length === 0) {
        return res.status(400).json({ message: "يرجى إرفاق صورة واحدة على الأقل للعمل المنجز" });
      }
      order.completionReport = {
        details: details.slice(0, 2000),
        images: images.slice(0, 10), // hard cap — UI also limits this
        submittedAt: new Date(),
      };
    }

    order.status = status;
    if (status === "rejected" || status === "cancelled") {
      order.cancelledBy = "worker";
      if (rejectionReason) order.rejectionReason = String(rejectionReason).slice(0, 500);
    }
    if (status === "completed") order.completedAt = new Date();
    await order.save();

    // ─── Wallet credit on completion ──────────────────────────────
    if (status === "completed" && order.proposedPrice > 0) {
      try {
        const earnings = Number(order.proposedPrice) || 0;
        await WorkerProfile.findOneAndUpdate(
          { userId: req.user._id },
          {
            $inc: {
              walletBalance: earnings,
              lifetimeEarnings: earnings,
            },
          },
        );
        await WalletTransaction.create({
          workerId: req.user._id,
          type: "credit",
          amount: earnings,
          source: "order_completion",
          relatedOrderId: order._id,
          status: "completed",
          note: `دفعة مقابل: ${order.serviceId?.name || "خدمة"}`,
        });
      } catch (walletErr) {
        // Log but don't fail the status change — the order is legitimately
        // completed, the wallet credit can be reconciled by an admin if
        // something went wrong here.
        console.error("wallet credit error:", walletErr);
      }
    }

    // ─── Rank recompute on completion ────────────────────────────
    // Atomically increment the worker's completed-orders counter
    // and recompute their rank if it changed. Independent of the
    // wallet credit so a wallet failure doesn't block the rank
    if (status === "completed") {
      try {
        const profile = await WorkerProfile.findOneAndUpdate(
          { userId: req.user._id },
          { $inc: { completedOrdersCount: 1 } },
          { new: true },
        );
        if (profile) {
          const next = computeRank(profile.completedOrdersCount);
          if (profile.rank !== next) {
            profile.rank = next;
            await profile.save();
          }
        }
      } catch (rankErr) {
        // Log but don't fail the status change — same rationale as the
        // wallet credit above. Rank can be reconciled by re-running the
        // backfill script if anything goes wrong here.
        console.error("rank recompute error:", rankErr);
      }
    }

    // Customer-facing notification — type depends on the transition so the
    // bell colors work out (green for good news, red for bad).
    const serviceName = order.serviceId?.name || "الخدمة";
    let title = "";
    let message = "";
    let type = "info";
    if (status === "accepted") {
      title = "تم قبول طلبك";
      message = `وافق الحرفي على طلب: ${serviceName}`;
      type = "success";
    } else if (status === "rejected") {
      title = "تم رفض طلبك";
      message = rejectionReason
        ? `تم رفض طلب ${serviceName}. السبب: ${rejectionReason}`
        : `تم رفض طلب: ${serviceName}`;
      type = "error";
    } else if (status === "in_progress") {
      title = "بدأ تنفيذ طلبك";
      message = `الحرفي الآن يعمل على: ${serviceName}`;
      type = "info";
    } else if (status === "completed") {
      title = "تم إنجاز طلبك";
      message = `تم إنجاز: ${serviceName}. يمكنك الاطلاع على تقرير العمل في صفحة طلباتك.`;
      type = "success";
    } else if (status === "cancelled") {
      title = "تم إلغاء طلبك";
      message = `تم إلغاء: ${serviceName}`;
      type = "warning";
    }

    if (title) {
      const notif = await Notification.create({
        userId: order.customerId._id,
        title,
        message,
        type,
        link: "/profile",
      });
      emitNotification(req, order.customerId._id, notif);
    }

    res.json({ order });
  } catch (err) {
    console.error("updateOrderStatusByWorker error:", err);
    res.status(500).json({ message: "خطأ في تحديث حالة الطلب" });
  }
};

// ============================================================
// POST /api/customer/orders/:id/cancel
// ============================================================
// Customer-initiated cancellation. Two modes based on current order status:
// ============================================================
const cancelOrderByCustomer = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const reasonText = String(reason || "").trim().slice(0, 500);

    const order = await ServiceRequest.findById(req.params.id)
      .populate("workerId", "firstName lastName")
      .populate("serviceId", "name");
    if (!order) return res.status(404).json({ message: "الطلب غير موجود" });

    // Ownership — the customer on the order is the only one who can cancel it
    // through this endpoint. Admin has a separate path (updateOrderStatus).
    if (String(order.customerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "غير مصرح" });
    }

    // Block actions on terminal states (already done — nothing to cancel).
    if (["completed", "cancelled", "rejected"].includes(order.status)) {
      return res.status(400).json({ message: "لا يمكن إلغاء طلب في هذه الحالة" });
    }

    // Block re-request if there's already a pending cancel request.
    if (order.cancellationRequest?.status === "pending") {
      return res.status(400).json({ message: "طلب الإلغاء قيد المراجعة بالفعل" });
    }

    // ── Mode 1: direct cancel on a pending order ──
    if (order.status === "pending") {
      order.status = "cancelled";
      order.cancelledBy = "customer";
      if (reasonText) order.rejectionReason = reasonText;
      await order.save();

      // Notify the worker so they can clear the order out of their dashboard
      if (order.workerId) {
        const serviceName = order.serviceId?.name || "الخدمة";
        const notif = await Notification.create({
          userId: order.workerId._id || order.workerId,
          title: "تم إلغاء طلب",
          message: reasonText
            ? `ألغى العميل طلب "${serviceName}". السبب: ${reasonText}`
            : `ألغى العميل طلب "${serviceName}"`,
          type: "warning",
          link: "/dashboard",
        });
        emitNotification(req, order.workerId._id || order.workerId, notif);
      }

      return res.json({ order, mode: "direct" });
    }

    // ── Mode 2: request-approval flow for accepted / in_progress ──
    order.cancellationRequest = {
      requestedBy: "customer",
      reason: reasonText,
      status: "pending",
      requestedAt: new Date(),
    };
    await order.save();

    // Notify the worker — they need to decide.
    const serviceName = order.serviceId?.name || "الخدمة";
    const notif = await Notification.create({
      userId: order.workerId._id || order.workerId,
      title: "طلب إلغاء من العميل",
      message: reasonText
        ? `طلب العميل إلغاء "${serviceName}". السبب: ${reasonText}`
        : `طلب العميل إلغاء "${serviceName}"`,
      type: "warning",
      link: "/dashboard",
    });
    emitNotification(req, order.workerId._id || order.workerId, notif);

    res.json({ order, mode: "request" });
  } catch (err) {
    console.error("cancelOrderByCustomer error:", err);
    res.status(500).json({ message: "خطأ في إلغاء الطلب" });
  }
};

// ============================================================
// PUT /api/worker/orders/:id/cancellation
// ============================================================
// Worker approves or denies a pending cancellation request.
// Body: { action: "approved" | "denied", denialReason? }
// ============================================================
const respondToCancellationByWorker = async (req, res) => {
  try {
    const { action, denialReason } = req.body || {};
    if (!["approved", "denied"].includes(action)) {
      return res.status(400).json({ message: "الإجراء غير صالح" });
    }

    const order = await ServiceRequest.findById(req.params.id)
      .populate("customerId", "firstName lastName")
      .populate("serviceId", "name");
    if (!order) return res.status(404).json({ message: "الطلب غير موجود" });

    if (!order.workerId || String(order.workerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "غير مصرح" });
    }
    if (order.cancellationRequest?.status !== "pending") {
      return res.status(400).json({ message: "لا يوجد طلب إلغاء معلّق" });
    }

    order.cancellationRequest.status = action;
    order.cancellationRequest.respondedAt = new Date();
    if (action === "denied" && denialReason) {
      order.cancellationRequest.denialReason = String(denialReason).slice(0, 500);
    }
    if (action === "approved") {
      order.status = "cancelled";
      order.cancelledBy = "worker";
    }
    await order.save();

    // Notify the customer about the outcome.
    const serviceName = order.serviceId?.name || "الخدمة";
    const title = action === "approved"
      ? "تمت الموافقة على إلغاء طلبك"
      : "تم رفض طلب الإلغاء";
    const message = action === "approved"
      ? `وافق الحرفي على إلغاء "${serviceName}"`
      : (order.cancellationRequest.denialReason
          ? `رفض الحرفي إلغاء "${serviceName}". السبب: ${order.cancellationRequest.denialReason}`
          : `رفض الحرفي إلغاء "${serviceName}". يمكنك التواصل معه للتفاصيل.`);
    const notif = await Notification.create({
      userId: order.customerId._id,
      title,
      message,
      type: action === "approved" ? "success" : "warning",
      link: "/profile",
    });
    emitNotification(req, order.customerId._id, notif);

    res.json({ order });
  } catch (err) {
    console.error("respondToCancellationByWorker error:", err);
    res.status(500).json({ message: "خطأ في معالجة طلب الإلغاء" });
  }
};

module.exports = {
  createOrder,
  updateOrderStatusByWorker,
  cancelOrderByCustomer,
  respondToCancellationByWorker,
};
