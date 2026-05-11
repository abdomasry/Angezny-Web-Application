const mongoose = require("mongoose");

// ============================================================
// SupportTicket (legacy model name "Ticket")
// ============================================================

const replySchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Stored on the reply itself (not derived on read) so we don't need
    authorRole: {
      type: String,
      enum: ["customer", "worker", "admin"],
      required: true,
    },
    message: { type: String, required: true },
    attachments: [
      {
        url: String,
        kind: { type: String, enum: ["image", "file"] },
        fileName: String,
        fileSize: Number,
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const ticketSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "service_issue",
        "user_report",
        "technical",
        "payment_issue",
        "other",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 150,
    },
    message: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    // Optional context references. All three are nullable — "technical" and
    // "other" tickets leave them empty.
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    targetServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerServices",
    },
    targetOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceRequest",
    },
    attachments: [
      {
        url: String,
        kind: { type: String, enum: ["image", "file"] },
        fileName: String,
        fileSize: Number,
      },
    ],
    replies: [replySchema],
    // Used by the admin list to sort "freshest first" (new tickets + tickets
    // with new replies bubble to the top). Indexed because it's the default
    // sort key for admin list queries.
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Ticket", ticketSchema);
