// ============================================================
// Support Routes
// ============================================================
// User-facing ticket endpoints. Admin-side ticket endpoints live in
// admin.routes.js so they can reuse the adminOnly middleware chain.
//
// All routes require authMiddleware. The controllers handle the fine-
// grained access rules:
//   - createTicket rejects admin role
//   - getTicket / addReply check "owner or admin"
// ============================================================

const express = require("express");
const router = express.Router();

const {
  createTicket,
  listMyTickets,
  getTicket,
  addReply,
} = require("../controllers/support.controller");
const authMiddleware = require("../middleware/auth.middleware");
const { supportCreateLimiter } = require("../middleware/rate-limit.middleware");

// Ticket creation is rate-limited (15/hour) to deter ticket-spam. List/get/
// reply paths are read- or scoped-write paths and aren't worth limiting yet.
router.post("/tickets", authMiddleware, supportCreateLimiter, createTicket);
router.get("/tickets", authMiddleware, listMyTickets);
router.get("/tickets/:id", authMiddleware, getTicket);
router.post("/tickets/:id/reply", authMiddleware, addReply);

module.exports = router;
