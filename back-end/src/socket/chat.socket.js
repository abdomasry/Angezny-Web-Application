const jwt = require("jsonwebtoken");
const User = require("../models/User.Model");
const Conversation = require("../models/Conversation");
const LiveChat = require("../models/LiveChat");
const Notification = require("../models/Notification");
const groqService = require("../services/groq.service");
const aiRateLimit = require("../utils/aiRateLimit");

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

// ============================================================
// AI reply pipeline — invoked from chat:send when the conversation is
// type "ai". Runs as fire-and-forget after the user's message has been
// persisted + broadcast.
//
// Steps:
//   1. Rate-limit check (in-memory per-user; see utils/aiRateLimit.js)
//   2. Classifier — small model decides on/off topic. Off-topic gets a
//      canned bilingual refusal persisted as a normal AI message.
//   3. Streaming main model — emits "ai:stream" chunks to the user's
//      room as Groq sends them. Tool calls (DB lookups) happen inside
//      groqService.streamAnswer and are transparent to this layer.
//   4. Persist the full assembled text as a LiveChat doc and emit a
//      "chat:message" so the inbox preview / unread count / multi-tab
//      mirror updates run through the same plumbing as a human message.
//
// On error we emit "ai:error" instead of crashing the socket, so the
// client can show a toast and re-enable the composer.
// ============================================================
async function handleAiReply({ io, conversation, userId, aiUserId }) {
  const conversationId = String(conversation._id);
  const userRoom = `user:${userId}`;

  if (!aiUserId) {
    io.to(userRoom).emit("ai:error", {
      conversationId,
      code: "not_configured",
      message: "AI assistant is not configured on this server.",
    });
    return;
  }

  // Step 1 — rate limit.
  const rate = aiRateLimit.checkAndIncrement(userId);
  if (!rate.allowed) {
    io.to(userRoom).emit("ai:error", {
      conversationId,
      code: "rate_limited",
      scope: rate.scope,
      retryAfterSec: rate.retryAfterSec,
      message:
        rate.scope === "hour"
          ? `وصلت إلى الحد الأقصى لهذه الساعة. حاول بعد ${Math.ceil(rate.retryAfterSec / 60)} دقيقة.`
          : `وصلت إلى الحد الأقصى لهذا اليوم. حاول غدًا.`,
    });
    return;
  }

  // Pull the last N messages as context. AI_HISTORY_WINDOW caps token
  // cost on long-running threads while still letting the model see
  // enough recent history to follow a multi-turn conversation.
  // Default history window: 8 messages (4 user + 4 assistant). Smaller
  // than the original 15 because each replayed turn balloons input tokens
  // and the Groq free-tier TPM (tokens-per-minute) cap is what trips
  // first when users send messages back-to-back. Override via env if
  // you have a paid plan with more headroom.
  const windowSize = Math.max(
    2,
    parseInt(process.env.AI_HISTORY_WINDOW, 10) || 8,
  );
  const recentDocsDesc = await LiveChat.find({ conversationId })
    .sort({ _id: -1 })
    .limit(windowSize)
    .lean();
  const historyDocs = recentDocsDesc.reverse(); // oldest-first
  const latestUserMessage = historyDocs[historyDocs.length - 1]?.message || "";

  // Step 2 — classifier.
  const { onTopic } = await groqService.classifyOnTopic(latestUserMessage);

  // Helper: persist an AI message + broadcast it as a normal chat:message.
  // The frontend already knows how to render messages from the AI user;
  // reusing the same wire format keeps the inbox preview, unread badge,
  // and multi-tab mirror working without special-cased code paths.
  const persistAndBroadcastAiMessage = async (text) => {
    const doc = await LiveChat.create({
      conversationId,
      senderId: aiUserId,
      message: text,
      messageType: "text",
    });
    conversation.lastMessage = text.slice(0, 120);
    conversation.lastMessageAt = new Date();
    // Don't bump unread for the user — they're actively chatting with
    // the AI; treating their own session as "unread" would be confusing.
    await conversation.save();

    const wire = {
      _id: doc._id,
      conversationId,
      senderId: String(aiUserId),
      message: text,
      messageType: "text",
      fileName: null,
      fileSize: null,
      isRead: true,
      createdAt: doc.createdAt,
    };
    io.to(userRoom).emit("chat:message", wire);
    return wire;
  };

  if (!onTopic) {
    await persistAndBroadcastAiMessage(groqService.REFUSAL_TEXT);
    return;
  }

  // Step 3 — stream the answer. We open the floodgates by emitting an
  // "ai:stream:start" so the UI can show a "typing..." bubble even if
  // the first token takes a second to arrive (cold model warmup).
  io.to(userRoom).emit("ai:stream:start", { conversationId });

  let fullText = "";
  try {
    for await (const evt of groqService.streamAnswer({
      historyDocs,
      aiUserId,
    })) {
      if (evt.kind === "chunk") {
        io.to(userRoom).emit("ai:stream", {
          conversationId,
          chunk: evt.text,
        });
      } else if (evt.kind === "done") {
        fullText = evt.fullText;
      }
    }
  } catch (err) {
    // Surface a concrete diagnosis to BOTH the backend log AND the user's
    // chat bubble. Without this, every Groq failure looked identical and
    // there was no way to tell "rate limit, wait a minute" from "your
    // API key is wrong, fix .env" from "Groq is down".
    const status = err?.status || err?.response?.status;
    const groqBody = err?.error || err?.response?.data;
    console.error(
      "streamAnswer error:",
      `status=${status || "n/a"}`,
      "message=",
      err?.message,
      "groqBody=",
      JSON.stringify(groqBody)?.slice(0, 500),
    );

    // Map common Groq failures to friendly messages. Anything we don't
    // recognize falls back to the generic "try again" text.
    let userMessage = "حدث خطأ أثناء توليد الإجابة. حاول مرة أخرى.";
    let code = "upstream";
    if (status === 429) {
      code = "rate_limited_upstream";
      userMessage =
        "وصلنا إلى الحد المسموح به من Groq لهذه الدقيقة. انتظر دقيقة وحاول مرة أخرى.";
    } else if (status === 401 || status === 403) {
      code = "auth";
      userMessage =
        "مفتاح Groq غير صحيح أو منتهي الصلاحية. تواصل مع مدير المنصة.";
    } else if (status === 400) {
      code = "bad_request";
      userMessage =
        "حدث خطأ في صياغة الطلب. سيتم إعادة بدء المحادثة قد يساعد.";
    } else if (err?.message?.toLowerCase?.()?.includes("timeout")) {
      code = "timeout";
      userMessage = "استغرق الرد وقتاً أطول من المعتاد. حاول مرة أخرى.";
    }

    io.to(userRoom).emit("ai:stream:end", { conversationId, aborted: true });
    io.to(userRoom).emit("ai:error", {
      conversationId,
      code,
      message: userMessage,
    });
    return;
  }

  // Step 4 — persist final text + emit the final chat:message. The
  // ai:stream:end event tells the client to clear its streaming buffer;
  // the chat:message that follows is the canonical, persistent record.
  const wire = await persistAndBroadcastAiMessage(fullText || "—");
  io.to(userRoom).emit("ai:stream:end", {
    conversationId,
    messageId: String(wire._id),
  });
}

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
    //
    // AI conversations (conversation.type === "ai") follow the same persist
    // + emit path for the user's outgoing message, then SKIP the usual
    // offline-notification block (the AI doesn't need bell pings) and
    // continue into the Groq classifier + streaming reply branch at the
    // end of this handler.
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

        const isAiConv = conversation.type === "ai";

        // The AI assistant only supports plain text — images/files would
        // require a multimodal model and aren't part of v1. We reject
        // attachments early so the user gets clear feedback.
        if (isAiConv && messageType !== "text") {
          return ack?.({
            ok: false,
            error: "AI assistant supports text messages only",
          });
        }

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
        // AI assistant branch — runs after the user's message is broadcast
        // so the UI immediately reflects the outgoing bubble, THEN streams
        // the assistant's reply on top. We early-return after this branch
        // to skip the offline-notification block below (the AI isn't a
        // bell-notifiable user; the recipient — the sender themself — is
        // already on the page).
        // ============================================================
        if (isAiConv) {
          ack?.({ ok: true, message: wireMessage });
          // Fire-and-forget — the reply pipeline runs on its own promise
          // chain so the ack returns immediately. Errors are surfaced via
          // the ai:error socket event, never thrown back at the user.
          handleAiReply({
            io,
            conversation,
            userId,
            aiUserId: global.AI_USER_ID,
          }).catch(err => {
            console.error("handleAiReply failed:", err);
            io.to(`user:${userId}`).emit("ai:error", {
              conversationId: String(conversation._id),
              code: "upstream",
              message: "تعذّر الاتصال بالمساعد الذكي. حاول مرة أخرى.",
            });
          });
          return;
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
