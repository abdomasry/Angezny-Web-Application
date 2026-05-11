const jwt = require("jsonwebtoken");
const User = require("../models/User.Model");
const Conversation = require("../models/Conversation");
const LiveChat = require("../models/LiveChat");
const Notification = require("../models/Notification");

// ============================================================
// Socket.IO chat handler
// ============================================================
// Module-scoped presence map.
// Key: userId (string).
// Value: Set of socketIds for that user (multi-tab support — a user is
// "online" as long as at least one socket from them is connected).
const onlineUsers = new Map();

// Helper: track that a user has a live socket.
const registerSocket = (userId, socketId) => {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
};

// Helper: remove a socketId; returns true if the user is now fully offline
// (no other sockets remaining).
const unregisterSocket = (userId, socketId) => {
  const set = onlineUsers.get(userId);
  if (!set) return true;
  set.delete(socketId);
  if (set.size === 0) {
    onlineUsers.delete(userId);
    return true;
  }
  return false;
};

// Helper: simple check used by chat:send to decide whether to create an
// offline notification for the recipient.
const isUserOnline = (userId) => onlineUsers.has(String(userId));

const attachChatSocket = (io) => {
  // ============================================================
  // io.use() — middleware that runs on every connection handshake.
  // Same JWT logic as auth.middleware.js but adapted for sockets:
  // token comes from socket.handshake.auth (set by the client's
  // io(URL, { auth: { token } }) call), not from HTTP headers.
  // ============================================================
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token provided"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select("-password");
      if (!user) return next(new Error("User not found"));
      if (user.status === "banned" || user.status === "suspended") {
        return next(new Error("Account not active"));
      }

      // Attach to the socket so all event handlers have cheap access.
      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = String(socket.user._id);

    socket.join(`user:${userId}`);
    registerSocket(userId, socket.id);

    socket.broadcast.emit("presence:update", { userId, online: true });

    socket.emit("presence:snapshot", {
      onlineUserIds: Array.from(onlineUsers.keys()),
    });

    // ============================================================
    // chat:send — the core message event.
    // Body: { conversationId, message, messageType }
    // Flow: validate sender → persist → update conv metadata →
    //       emit to both participants → maybe create offline Notification
    // ============================================================
    socket.on("chat:send", async (payload, ack) => {
      try {
        const {
          conversationId,
          message,
          messageType = "text",
          fileName,
          fileSize,
        } = payload || {};
        if (!conversationId || !message) {
          return ack?.({ ok: false, error: "missing fields" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation)
          return ack?.({ ok: false, error: "conversation not found" });

        // Security: only participants can post. Prevents a user from
        // spamming a random conversationId they guessed.
        const isParticipant = conversation.participants
          .map(String)
          .includes(userId);
        if (!isParticipant)
          return ack?.({ ok: false, error: "not a participant" });

        // Persist the message. fileName/fileSize are only kept for image/file
        // types — pointless on text messages.
        const safeType = ["text", "image", "file"].includes(messageType)
          ? messageType
          : "text";
        const live = await LiveChat.create({
          conversationId,
          senderId: socket.user._id,
          message,
          messageType: safeType,
          ...(safeType !== "text" && fileName
            ? { fileName: String(fileName).slice(0, 200) }
            : {}),
          ...(safeType !== "text" && typeof fileSize === "number"
            ? { fileSize }
            : {}),
        });

        // Build a concise snapshot for the conversation list / inbox preview.
        // Files get "📎 filename", images get a generic icon, text gets trimmed.
        const snapshot =
          safeType === "image"
            ? "📷 صورة"
            : safeType === "file"
              ? `📎 ${fileName || "ملف"}`
              : message.slice(0, 120);
        conversation.lastMessage = snapshot;
        conversation.lastMessageAt = new Date();
        for (const pid of conversation.participants.map(String)) {
          if (pid !== userId) {
            conversation.unreadCounts.set(
              pid,
              (conversation.unreadCounts.get(pid) || 0) + 1,
            );
          }
        }
        await conversation.save();

        // Build the payload we'll emit to clients (one shape everywhere).
        const wireMessage = {
          _id: live._id,
          conversationId,
          senderId: userId,
          message,
          messageType: live.messageType,
          fileName: live.fileName || null,
          fileSize: live.fileSize || null,
          isRead: false,
          createdAt: live.createdAt,
        };

        // Emit to every participant's user-room. This reaches the sender's
        // other tabs AND the recipient. Client-side de-dupes by _id if needed.
        for (const pid of conversation.participants.map(String)) {
          io.to(`user:${pid}`).emit("chat:message", wireMessage);
        }

        // ============================================================
        // Offline notification — only for participants who AREN'T online.
        // Dedupe: if they already have an unread notification for this
        // conversation, update it in place instead of stacking a new one.
        // ============================================================
        for (const pid of conversation.participants.map(String)) {
          if (pid === userId) continue; // don't notify the sender
          if (isUserOnline(pid)) continue; // online users got the live event

          const title = `رسالة جديدة من ${socket.user.firstName} ${socket.user.lastName}`;
          const body =
            safeType === "image"
              ? "أرسل لك صورة"
              : safeType === "file"
                ? `أرسل لك ملف: ${fileName || "ملف"}`
                : String(message).slice(0, 80);
          const link = `/messages/${conversationId}`;

          // Dedupe: reuse an existing unread notif for this conv if it exists.
          const existing = await Notification.findOne({
            userId: pid,
            link,
            isRead: false,
          });

          if (existing) {
            existing.title = title;
            existing.message = body;
            existing.createdAt = new Date(); // bump to the top of the bell list
            await existing.save();
          } else {
            await Notification.create({
              userId: pid,
              title,
              message: body,
              type: "info",
              link,
            });
          }
          // Even though the user is offline right now, they might be on a
          // different page (not /messages). If they're online on the Navbar
          // bell, we'd want to update their bell without refetch — handled
          // by the online branch. For fully-offline users, the notification
          // shows up on next login.
        }

        ack?.({ ok: true, message: wireMessage });
      } catch (err) {
        console.error("chat:send error:", err);
        ack?.({ ok: false, error: "server error" });
      }
    });

    // ============================================================
    // chat:typing — ephemeral, not persisted. Just broadcast to the
    // other participant so their client can show "is typing...".
    // ============================================================
    socket.on("chat:typing", async ({ conversationId, isTyping }) => {
      try {
        if (!conversationId) return;
        const conversation =
          await Conversation.findById(conversationId).select("participants");
        if (!conversation) return;
        const others = conversation.participants
          .map(String)
          .filter((p) => p !== userId);
        for (const pid of others) {
          io.to(`user:${pid}`).emit("chat:typing", {
            conversationId,
            userId,
            isTyping: !!isTyping,
          });
        }
      } catch (err) {
        console.error("chat:typing error:", err);
      }
    });

    // ============================================================
    // chat:read — user has seen new messages in a conversation.
    // Mark the messages as read, clear their unread counter, and tell
    // the sender so their client can render ✓✓ on the delivered items.
    // ============================================================
    socket.on("chat:read", async ({ conversationId }) => {
      try {
        if (!conversationId) return;
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;
        if (!conversation.participants.map(String).includes(userId)) return;

        // Mark every message NOT sent by me as read (only their-side
        // messages count as unread from my perspective).
        await LiveChat.updateMany(
          { conversationId, senderId: { $ne: socket.user._id }, isRead: false },
          { isRead: true },
        );
        conversation.unreadCounts.set(userId, 0);
        await conversation.save();

        // Tell the other participant(s) that their messages were seen.
        const others = conversation.participants
          .map(String)
          .filter((p) => p !== userId);
        for (const pid of others) {
          io.to(`user:${pid}`).emit("chat:read", {
            conversationId,
            readerId: userId,
          });
        }
      } catch (err) {
        console.error("chat:read error:", err);
      }
    });

    // ============================================================
    // disconnect — only broadcast "offline" if this was the user's
    // LAST socket (multi-tab: they may still be around in another tab).
    // ============================================================
    socket.on("disconnect", () => {
      const fullyOffline = unregisterSocket(userId, socket.id);
      if (fullyOffline) {
        socket.broadcast.emit("presence:update", { userId, online: false });
      }
    });
  });
};

module.exports = attachChatSocket;
