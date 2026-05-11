// ============================================================
// Review Routes
// ============================================================
// Only one endpoint for now: the customer submitting a review.
// The "read" side (GET worker reviews) already lives in worker.routes.js
// as /api/workers/:id/reviews.
// ============================================================

const express = require("express");
const router = express.Router();
const { createReview } = require("../controllers/review.controller");
const authMiddleware = require("../middleware/auth.middleware");

router.post("/", authMiddleware, createReview);

module.exports = router;
