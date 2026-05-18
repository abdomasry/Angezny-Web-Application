// ============================================================
// Payment Controller
// ============================================================
// Pay-in flow (customer → platform):
//   1) POST /api/payments/checkout    — customer-side endpoint that creates a
//      pending Payment doc and returns the Paymob hosted-checkout URL.
//   2) POST /api/payments/webhook     — server-to-server callback from Paymob
//      that flips the Payment doc to completed or failed.
//   3) GET  /api/payments/:id/status  — polled by the result page if the
//      webhook hasn't landed yet (the webhook is the source of truth, this
//      is a read-only convenience).
// ============================================================

const Payment = require("../models/Payment");
const ServiceRequest = require("../models/Service.Request");
const Notification = require("../models/Notification");
const WorkerServices = require("../models/Worker.Services");
const paymob = require("../services/paymob.service");

// Helper duplicated from order.controller.js. We rebuild the same Socket.IO
// emit here so the payment webhook can notify the worker the moment the
// payment clears — without needing a circular require on order.controller.
const emitNotification = (io, userId, notification) => {
  try {
    if (!io) return;
    io.to(`user:${String(userId)}`).emit("notification:new", notification);
  } catch (err) {
    console.error("emitNotification error:", err);
  }
};

// ============================================================
// POST /api/payments/checkout
// ============================================================
// Body: { orderId }
// Auth: customer (any logged-in user — we check ownership inside).
//
// Flow:
//   - Find the ServiceRequest, confirm it belongs to the caller.
//   - Confirm it's a card order in `pending` status that isn't already paid.
//   - Create (or reuse a pending) Payment doc.
//   - Call Paymob to get a hosted-checkout URL.
//   - Return the URL — the frontend redirects the browser to it.
// ============================================================
const createCheckout = async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ message: "orderId مطلوب" });
    }

    const order = await ServiceRequest.findById(orderId)
      .populate("serviceId", "name");
    if (!order) {
      return res.status(404).json({ message: "الطلب غير موجود" });
    }

    // Ownership: only the customer on the order can initiate the payment.
    if (String(order.customerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "غير مصرح" });
    }

    if (order.paymentMode !== "card") {
      return res.status(400).json({ message: "هذا الطلب ليس دفعاً بالبطاقة" });
    }
    // Allowed checkout states:
    //   - pending: customer-initiated card order awaiting payment.
    //   - pending_customer_confirmation: worker-initiated card order
    //     (before-service) awaiting the customer's payment to confirm.
    //   - completed: after-service card order whose work is done and now
    //     needs to be paid.
    const checkoutAllowed = ["pending", "pending_customer_confirmation", "completed"];
    if (!checkoutAllowed.includes(order.status)) {
      return res.status(400).json({ message: "لا يمكن دفع طلب في هذه الحالة" });
    }
    // For `completed` orders the payment is only allowed when timing is
    // `after` and no successful payment exists yet (avoid double-charging).
    if (order.status === "completed") {
      if (order.paymentTiming !== "after") {
        return res.status(400).json({ message: "هذا الطلب مدفوع بالفعل" });
      }
      const alreadyPaid = await Payment.findOne({
        serviceRequestId: order._id,
        status: "completed",
      });
      if (alreadyPaid) {
        return res.status(400).json({ message: "تم سداد هذا الطلب بالفعل" });
      }
    }

    // Reuse an existing pending Payment if the customer is just retrying the
    // same intent. We only create a new doc when the previous attempt failed
    // — that way the audit log shows every attempt.
    let payment = await Payment.findOne({
      serviceRequestId: order._id,
      status: "pending",
    });
    if (!payment) {
      payment = await Payment.create({
        serviceRequestId: order._id,
        customerId: req.user._id,
        workerId: order.workerId,
        amount: Number(order.proposedPrice) || 0,
        status: "pending",
      });
    }

    // Resolve service name for the Paymob line-item description.
    const itemName = order.serviceId?.name || "Service order";

    const { checkoutUrl, paymobOrderId, paymobIntentionId } =
      await paymob.createPaymentIntention({
        amount: Number(order.proposedPrice) || 0,
        customer: {
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          email: req.user.email,
          phone: req.user.phone,
        },
        billingData: {
          street: order.location?.address || "NA",
        },
        extras: {
          paymentId: String(payment._id),
          orderId: String(order._id),
          itemName,
          itemDescription: `Order ${order._id}`,
        },
      });

    // Save the Paymob ids so the webhook can reconcile by either id.
    payment.paymobOrderId = paymobOrderId || payment.paymobOrderId;
    payment.paymobIntentionId = paymobIntentionId || payment.paymobIntentionId;
    await payment.save();

    res.json({
      paymentId: String(payment._id),
      checkoutUrl,
    });
  } catch (err) {
    console.error("createCheckout error:", err);
    res.status(500).json({
      message: err.message || "تعذّر بدء عملية الدفع",
    });
  }
};

// ============================================================
// POST /api/payments/webhook
// ============================================================
// Paymob's "transaction processed" callback. Public route — no JWT — but
// gated by HMAC signature verification. Any payload that fails verification
// is rejected with 401 before we touch the DB.
//
// We must also be idempotent: Paymob retries the callback on transient
// errors, so the same transaction can arrive twice. We short-circuit if
// the Payment doc is already in a terminal state.
// ============================================================
const handleWebhook = async (req, res) => {
  try {
    // Paymob sends `?hmac=...` in the query string on the unified-checkout
    // callback. The body is the full payload object with an `obj` field.
    const receivedHmac = req.query?.hmac || req.body?.hmac;
    const obj = req.body?.obj || req.body;

    if (!obj) {
      return res.status(400).json({ message: "Missing obj" });
    }
    if (!paymob.verifyHmac(obj, receivedHmac)) {
      console.warn("paymob webhook: HMAC verification failed");
      return res.status(401).json({ message: "Invalid signature" });
    }

    // Pull our internal Payment id back from `special_reference` (preferred)
    // or fall back to the metadata block we set on the Intention payload.
    const paymentId =
      obj.payment_key_claims?.extra?.payment_id ||
      obj.order?.merchant_order_id ||
      obj.order?.special_reference ||
      obj.special_reference;

    const payment = paymentId
      ? await Payment.findById(paymentId)
      : await Payment.findOne({ paymobOrderId: String(obj.order?.id || "") });

    if (!payment) {
      // Acknowledge anyway — replying 4xx makes Paymob retry forever.
      console.warn("paymob webhook: no matching Payment for", paymentId);
      return res.json({ ok: true });
    }

    // Idempotency: ignore repeated callbacks on a terminal doc.
    if (payment.status === "completed" || payment.status === "failed") {
      return res.json({ ok: true });
    }

    const success = obj.success === true && obj.error_occured === false;

    if (success) {
      payment.status = "completed";
      payment.transactionId = String(obj.id || "");
      // Paymob's source_data.sub_type tells us which method was actually used.
      // The values are e.g. "Visa" / "MasterCard" / "wallet" / "InstaPay".
      const sub = String(obj.source_data?.sub_type || "").toLowerCase();
      if (sub === "wallet") payment.paymentMethod = "wallet";
      else if (sub.includes("instapay")) payment.paymentMethod = "instapay";
      else payment.paymentMethod = "card";
      payment.paidAt = new Date();
      await payment.save();

      // Now that money has cleared, notify the worker. This is the gate the
      // plan calls for: card orders don't ping the worker until payment is
      // confirmed (COD orders ping immediately from order.controller.js).
      try {
        const order = await ServiceRequest.findById(payment.serviceRequestId)
          .populate("serviceId", "name")
          .populate("customerId", "firstName lastName");
        if (order && order.workerId) {
          // Worker-initiated orders sit in pending_customer_confirmation
          // until payment clears. Once it does, promote to `accepted` so the
          // job can move forward without a separate worker accept step
          // (the worker already created it — they don't need to re-accept).
          if (order.status === "pending_customer_confirmation") {
            order.status = "accepted";
          }
          const customerName = order.customerId
            ? `${order.customerId.firstName} ${order.customerId.lastName}`.trim()
            : "عميل";
          const itemName =
            order.serviceId?.name || order.customTitle || "الخدمة";
          const notification = await Notification.create({
            userId: order.workerId,
            title: "طلب خدمة جديد (مدفوع)",
            message: `طلب من ${customerName} لـ: ${itemName} — تم الدفع`,
            type: "info",
            link: "/dashboard",
          });
          emitNotification(req.app.get("io"), order.workerId, notification);
        }

        // Link the Payment doc back onto the ServiceRequest so the order
        // detail view can show payment status next to the order.
        if (order && !order.payment) {
          order.payment = payment._id;
        }
        if (order) await order.save();
      } catch (notifyErr) {
        console.error("post-payment notify error:", notifyErr);
      }
    } else {
      payment.status = "failed";
      payment.failureReason =
        obj.data?.message || obj.error || "Payment failed at gateway";
      await payment.save();
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("paymob webhook error:", err);
    // Reply 200 anyway — Paymob retries on 5xx, and we've already logged.
    res.json({ ok: true });
  }
};

// ============================================================
// GET /api/payments/:paymentId/status
// ============================================================
// Cheap read endpoint used by /checkout/result to poll for the latest state.
// The webhook is authoritative — this is just a way to surface that state
// to the customer when the redirect lands a moment before the webhook.
// ============================================================
const getStatus = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    // Only the customer who initiated this payment can read it.
    if (String(payment.customerId) !== String(req.user._id)) {
      return res.status(403).json({ message: "غير مصرح" });
    }
    res.json({
      payment: {
        _id: payment._id,
        status: payment.status,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        failureReason: payment.failureReason,
        paidAt: payment.paidAt,
        serviceRequestId: payment.serviceRequestId,
      },
    });
  } catch (err) {
    console.error("getStatus error:", err);
    res.status(500).json({ message: "خطأ في قراءة حالة الدفع" });
  }
};

module.exports = {
  createCheckout,
  handleWebhook,
  getStatus,
};
