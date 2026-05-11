// ============================================================
// Review Controller — bidirectional
// ============================================================
// One endpoint (POST /api/reviews) handles both:
//   - Customer → Worker:  caller is customer on the order, status completed
//   - Worker   → Customer: caller is worker on the order, status completed
//
// Direction is INFERRED from req.user.role — clients never specify it.
//
// Dedupe: one review per (serviceRequestId, direction) pair. So the same
// completed order can carry both kinds of review, but each side can only
// submit once per order.
//
// Aggregates:
//   customer_to_worker → updates WorkerProfile.{ratingAverage,totalReviews}
//   worker_to_customer → updates User.{customerRatingAverage,customerTotalReviews}
//
// Notifications:
//   customer_to_worker → notify worker (existing)
//   worker_to_customer → SILENT (the customer must not see their own rating)
// ============================================================

const Review = require("../models/Review");
const User = require("../models/User.Model");
const ServiceRequest = require("../models/Service.Request");
const WorkerProfile = require("../models/Worker.Profile");
const Notification = require("../models/Notification");

const emitNotification = (req, userId, notification) => {
  try {
    const io = req.app.get("io");
    if (!io) return;
    io.to(`user:${String(userId)}`).emit("notification:new", notification);
  } catch (err) {
    console.error("emitNotification error:", err);
  }
};

const roundAvg = (oldAvg, oldCount, newRating) => {
  const newCount = oldCount + 1;
  return Math.round(((oldAvg * oldCount + newRating) / newCount) * 10) / 10;
};

const createReview = async (req, res) => {
  try {
    const { serviceRequestId, rating, comment } = req.body || {};
    if (!serviceRequestId) {
      return res.status(400).json({ message: "يرجى تحديد الطلب" });
    }
    const ratingNum = Number(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ message: "التقييم يجب أن يكون بين 1 و 5" });
    }

    const order = await ServiceRequest.findById(serviceRequestId);
    if (!order) return res.status(404).json({ message: "الطلب غير موجود" });
    if (order.status !== "completed") {
      return res.status(400).json({ message: "يمكن تقييم الطلبات المكتملة فقط" });
    }

    const role = req.user.role;
    let direction;
    if (role === "customer") {
      if (String(order.customerId) !== String(req.user._id)) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      if (!order.workerId) {
        return res.status(400).json({ message: "لا يوجد حرفي مرتبط بهذا الطلب" });
      }
      direction = "customer_to_worker";
    } else if (role === "worker") {
      if (String(order.workerId) !== String(req.user._id)) {
        return res.status(403).json({ message: "غير مصرح" });
      }
      if (!order.customerId) {
        return res.status(400).json({ message: "لا يوجد عميل مرتبط بهذا الطلب" });
      }
      direction = "worker_to_customer";
    } else {
      return res.status(403).json({ message: "غير مصرح" });
    }

    const existing = await Review.findOne({ serviceRequestId, direction });
    if (existing) {
      return res.status(409).json({ message: "لقد قمت بتقييم هذا الطلب مسبقاً" });
    }

    const review = await Review.create({
      serviceRequestId,
      customerId: order.customerId,
      workerId: order.workerId,
      rating: ratingNum,
      comment: String(comment || "").trim().slice(0, 1000),
      direction,
    });

    if (direction === "customer_to_worker") {
      const profile = await WorkerProfile.findOne({ userId: order.workerId });
      if (profile) {
        const oldCount = profile.totalReviews || 0;
        const oldAvg = profile.ratingAverage || 0;
        profile.totalReviews = oldCount + 1;
        profile.ratingAverage = roundAvg(oldAvg, oldCount, ratingNum);
        await profile.save();
      }
      const notif = await Notification.create({
        userId: order.workerId,
        title: "تقييم جديد",
        message: `قام العميل بتقييم خدمتك بـ ${ratingNum} من 5`,
        type: "success",
        link: "/dashboard",
      });
      emitNotification(req, order.workerId, notif);
    } else {
      // worker_to_customer: update aggregates on the User doc, NO notification.
      const customer = await User.findById(order.customerId).select(
        "customerRatingAverage customerTotalReviews"
      );
      if (customer) {
        const oldCount = customer.customerTotalReviews || 0;
        const oldAvg = customer.customerRatingAverage || 0;
        customer.customerTotalReviews = oldCount + 1;
        customer.customerRatingAverage = roundAvg(oldAvg, oldCount, ratingNum);
        await customer.save();
      }
    }

    res.status(201).json({ review });
  } catch (err) {
    console.error("createReview error:", err);
    res.status(500).json({ message: "خطأ في إنشاء التقييم" });
  }
};

module.exports = { createReview };
