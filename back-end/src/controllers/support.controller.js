// ============================================================
// Support Controller
// ============================================================
// End-to-end support ticket handling. Endpoints:
//
//   User side (auth, no role restriction — except create blocks admins)
//     POST   /api/support/tickets            → createTicket
//     GET    /api/support/tickets            → listMyTickets
//     GET    /api/support/tickets/:id        → getTicket (owner OR admin)
//     POST   /api/support/tickets/:id/reply  → addReply  (owner OR admin)
//
//   Admin side (auth + adminOnly)
//     GET    /api/admin/tickets              → listAllTickets
//     PUT    /api/admin/tickets/:id/status   → updateStatus
//
// Notifications use the same Notification + notification:new socket pattern
// as order.controller / review.controller.
// ============================================================

const mongoose = require("mongoose");
const Ticket = require("../models/Tickets");
const Notification = require("../models/Notification");
const User = require("../models/User.Model");

// Helper: emit notification:new to a single user's room. Silent on errors
// (socket events are best-effort — the DB notification is the source of truth).
const emitNotification = (req, userId, notification) => {
  try {
    const io = req.app.get("io");
    if (!io) return;
    io.to(`user:${String(userId)}`).emit("notification:new", notification);
  } catch (err) {
    console.error("emitNotification error:", err);
  }
};

// Helper: create a Notification for every admin user and emit it. Used when a
// ticket is first filed and when the user replies on an existing ticket.
const notifyAllAdmins = async (req, { title, message, link, type = "info" }) => {
  try {
    const admins = await User.find({ role: "admin" }).select("_id");
    await Promise.all(
      admins.map(async (a) => {
        const notif = await Notification.create({
          userId: a._id,
          title,
          message,
          type,
          link,
        });
        emitNotification(req, a._id, notif);
      }),
    );
  } catch (err) {
    console.error("notifyAllAdmins error:", err);
  }
};

// Sanitizes an attachments payload from the client. We never trust client
// input for URLs, but since Cloudinary is the only upload path and keys are
// normalized there, this is a shape check + defensive cap.
const sanitizeAttachments = (raw, cap = 8) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a.url === "string")
    .slice(0, cap)
    .map((a) => ({
      url: String(a.url),
      kind: a.kind === "image" ? "image" : "file",
      fileName: String(a.fileName || "").slice(0, 200),
      fileSize: Number(a.fileSize) || 0,
    }));
};

// Defines what replies / initial message populate chain looks like. Pulled
// into a helper because getTicket + addReply + updateStatus all need the
// same populated shape in their responses.
const populateTicket = (q) =>
  q
    .populate("userId", "firstName lastName profileImage role")
    .populate("targetUserId", "firstName lastName profileImage role")
    .populate("targetServiceId", "name images")
    .populate("targetOrderId", "_id status proposedPrice")
    .populate("replies.authorId", "firstName lastName profileImage role");

// ============================================================
// POST /api/support/tickets
// ============================================================
const createTicket = async (req, res) => {
  try {
    // Admins don't "open" tickets — they respond to them.
    if (req.user.role === "admin") {
      return res.status(403).json({ message: "الأدمن لا يفتح بلاغات" });
    }

    const {
      type,
      title,
      message,
      targetUserId,
      targetServiceId,
      targetOrderId,
      attachments,
    } = req.body || {};

    const ALLOWED_TYPES = [
      "service_issue",
      "user_report",
      "technical",
      "payment_issue",
      "other",
    ];
    if (!type || !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ message: "نوع البلاغ غير صالح" });
    }
    const titleText = String(title || "").trim().slice(0, 150);
    const messageText = String(message || "").trim().slice(0, 2000);
    if (!titleText) {
      return res.status(400).json({ message: "يرجى كتابة عنوان البلاغ" });
    }
    if (!messageText) {
      return res.status(400).json({ message: "يرجى كتابة تفاصيل البلاغ" });
    }

    const safeAttachments = sanitizeAttachments(attachments);
    const now = new Date();

    // Seed the first reply from the ticket's initial message so the thread
    // renderer can treat every bubble uniformly. The ticket.message field
    // still holds the initial text (kept for list previews).
    const initialReply = {
      authorId: req.user._id,
      authorRole: req.user.role,
      message: messageText,
      attachments: safeAttachments,
      createdAt: now,
    };

    const ticket = await Ticket.create({
      userId: req.user._id,
      type,
      title: titleText,
      message: messageText,
      status: "open",
      targetUserId: targetUserId && mongoose.isValidObjectId(targetUserId) ? targetUserId : undefined,
      targetServiceId: targetServiceId && mongoose.isValidObjectId(targetServiceId) ? targetServiceId : undefined,
      targetOrderId: targetOrderId && mongoose.isValidObjectId(targetOrderId) ? targetOrderId : undefined,
      attachments: safeAttachments,
      replies: [initialReply],
      lastActivityAt: now,
    });

    // Notify every admin about the new ticket. Deep link lets the bell click
    // land on /admin?section=support&ticket=<id>.
    const submitterName = `${req.user.firstName} ${req.user.lastName}`.trim();
    await notifyAllAdmins(req, {
      title: "بلاغ جديد",
      message: `${submitterName}: ${titleText}`,
      link: `/admin?section=support&ticket=${ticket._id}`,
      type: "info",
    });

    const populated = await populateTicket(Ticket.findById(ticket._id));
    res.status(201).json({ ticket: populated });
  } catch (err) {
    console.error("createTicket error:", err);
    res.status(500).json({ message: "خطأ في إنشاء البلاغ" });
  }
};

// ============================================================
// GET /api/support/tickets
// ============================================================
const listMyTickets = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;

    const filter = { userId: req.user._id };
    if (status && status !== "all") filter.status = status;

    const total = await Ticket.countDocuments(filter);
    const tickets = await Ticket.find(filter)
      .populate("targetUserId", "firstName lastName")
      .populate("targetServiceId", "name")
      .select("-replies") // list view doesn't need the whole thread
      .sort({ lastActivityAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      tickets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("listMyTickets error:", err);
    res.status(500).json({ message: "خطأ في تحميل البلاغات" });
  }
};

// ============================================================
// GET /api/support/tickets/:id  (owner OR admin)
// ============================================================
const getTicket = async (req, res) => {
  try {
    const ticket = await populateTicket(Ticket.findById(req.params.id));
    if (!ticket) return res.status(404).json({ message: "البلاغ غير موجود" });

    const isOwner = String(ticket.userId?._id || ticket.userId) === String(req.user._id);
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "غير مصرح" });
    }

    res.json({ ticket });
  } catch (err) {
    console.error("getTicket error:", err);
    res.status(500).json({ message: "خطأ في تحميل البلاغ" });
  }
};

// ============================================================
// POST /api/support/tickets/:id/reply  (owner OR admin)
// ============================================================
const addReply = async (req, res) => {
  try {
    const { message, attachments } = req.body || {};
    const messageText = String(message || "").trim().slice(0, 2000);
    if (!messageText) {
      return res.status(400).json({ message: "الرسالة فارغة" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "البلاغ غير موجود" });

    const isOwner = String(ticket.userId) === String(req.user._id);
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "غير مصرح" });
    }

    // Closed tickets are read-only. If the user wants to re-open a closed
    // issue they'd file a new ticket — keeps thread semantics clean.
    if (ticket.status === "closed") {
      return res.status(400).json({ message: "هذا البلاغ مغلق" });
    }

    const now = new Date();
    ticket.replies.push({
      authorId: req.user._id,
      authorRole: req.user.role,
      message: messageText,
      attachments: sanitizeAttachments(attachments),
      createdAt: now,
    });
    ticket.lastActivityAt = now;
    await ticket.save();

    // Route the notification based on who just replied.
    if (isAdmin) {
      const notif = await Notification.create({
        userId: ticket.userId,
        title: "رد جديد على بلاغك",
        message: ticket.title,
        type: "info",
        link: `/support/${ticket._id}`,
      });
      emitNotification(req, ticket.userId, notif);
    } else {
      await notifyAllAdmins(req, {
        title: "رد جديد على بلاغ دعم",
        message: ticket.title,
        link: `/admin?section=support&ticket=${ticket._id}`,
        type: "info",
      });
    }

    const populated = await populateTicket(Ticket.findById(ticket._id));
    res.json({ ticket: populated });
  } catch (err) {
    console.error("addReply error:", err);
    res.status(500).json({ message: "خطأ في إرسال الرد" });
  }
};

// ============================================================
// GET /api/admin/tickets  (admin-only)
// ============================================================
const listAllTickets = async (req, res) => {
  try {
    const { status, type, search, page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;

    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (type && type !== "all") filter.type = type;
    if (search && String(search).trim()) {
      const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");
      filter.$or = [{ title: rx }, { message: rx }];
    }

    const total = await Ticket.countDocuments(filter);
    const tickets = await Ticket.find(filter)
      .populate("userId", "firstName lastName profileImage role")
      .populate("targetUserId", "firstName lastName")
      .populate("targetServiceId", "name")
      .select("-replies") // list view doesn't need the whole thread
      .sort({ lastActivityAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      tickets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("listAllTickets error:", err);
    res.status(500).json({ message: "خطأ في تحميل البلاغات" });
  }
};

// ============================================================
// PUT /api/admin/tickets/:id/status  (admin-only)
// ============================================================
const updateStatus = async (req, res) => {
  try {
    const { status } = req.body || {};
    const ALLOWED = ["open", "in_progress", "resolved", "closed"];
    if (!status || !ALLOWED.includes(status)) {
      return res.status(400).json({ message: "الحالة غير صالحة" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "البلاغ غير موجود" });

    const prev = ticket.status;
    ticket.status = status;
    ticket.lastActivityAt = new Date();
    await ticket.save();

    // Notify the submitter about status changes. We skip the notification if
    // admin somehow set the status to the same value twice.
    if (prev !== status) {
      const labels = {
        open: "البلاغ مفتوح",
        in_progress: "البلاغ قيد المعالجة",
        resolved: "تم حل البلاغ",
        closed: "تم إغلاق البلاغ",
      };
      const notif = await Notification.create({
        userId: ticket.userId,
        title: labels[status] || "تحديث حالة البلاغ",
        message: ticket.title,
        type: status === "resolved" ? "success" : status === "closed" ? "warning" : "info",
        link: `/support/${ticket._id}`,
      });
      emitNotification(req, ticket.userId, notif);
    }

    const populated = await populateTicket(Ticket.findById(ticket._id));
    res.json({ ticket: populated });
  } catch (err) {
    console.error("updateStatus error:", err);
    res.status(500).json({ message: "خطأ في تحديث الحالة" });
  }
};

module.exports = {
  createTicket,
  listMyTickets,
  getTicket,
  addReply,
  listAllTickets,
  updateStatus,
};
