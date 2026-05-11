const express = require("express");
const router = express.Router();
const {
  listConversations,
  findOrCreateConversation,
  getMessages,
  getUnreadTotal,
  getConversation,
} = require("../controllers/chat.controller");
const authMiddleware = require("../middleware/auth.middleware");

// All chat REST endpoints require auth. Socket.IO has its own separate
// auth middleware (io.use in chat.socket.js) — the two worlds don't share
// middleware but do share the same JWT logic.

router.get("/conversations", authMiddleware, listConversations);
router.post("/conversations", authMiddleware, findOrCreateConversation);
router.get("/conversations/:id", authMiddleware, getConversation);
router.get("/conversations/:id/messages", authMiddleware, getMessages);
router.get("/unread-total", authMiddleware, getUnreadTotal);

module.exports = router;
