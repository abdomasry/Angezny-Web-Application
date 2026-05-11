const mongoose = require('mongoose');

// Conversation — represents a 1-to-1 DM channel between two users.
const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Optional link to a ServiceRequest — currently unused (chat is free-form
    // between customer and worker) but kept for future "chat tied to an order"
    // flows.
    serviceRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceRequest",
    },
    // Optional link to the WorkerService the conversation is "about". Set
    // when the customer clicks the chat icon on a service card so the
    // service-context banner survives a refresh and isn't reliant on the
    // ?service= query param being present.
    serviceContextId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerServices",
    },
    // Snapshot of the latest message so the inbox can render rows without
    // a second query per conversation. Denormalized on purpose.
    lastMessage: String,
    lastMessageAt: Date,
    // Per-participant unread count. Keys are userIds as strings.
    // Incremented when a message is sent to someone who isn't in the room;
    // reset to 0 when that user's client fires chat:read for this conv.
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);
