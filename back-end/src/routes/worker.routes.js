const express = require("express");
const router = express.Router();
const { getWorkers, getWorkerById, getWorkerReviews, getServiceById, updateMyLocation } = require("../controllers/worker.controller");
const authMiddleware = require("../middleware/auth.middleware");
const workerOnly = require("../middleware/worker.middleware");

// === Public routes — anyone can access these (no auth needed) ===

// GET /api/workers — Browse all workers with filtering/pagination
// The frontend services page calls this with query params for filtering
router.get("/", getWorkers);

// === Authed routes — worker updating own data ===

// PUT /api/workers/me/location — worker saves their geo coords + address.
// MUST come BEFORE the /:id routes so Express doesn't match "me" as :id.
router.put("/me/location", authMiddleware, workerOnly, updateMyLocation);

// GET /api/workers/service/:serviceId — Single service lookup for checkout + chat-seed.
// MUST come BEFORE the generic /:id route — otherwise Express will match the
// string "service" against `:id` and call getWorkerById with a bogus id.
router.get("/service/:serviceId", getServiceById);

// GET /api/workers/:id — View a single worker's full profile
// The frontend worker profile page calls this when someone clicks on a worker card
router.get("/:id", getWorkerById);

// GET /api/workers/:id/reviews — View reviews for a specific worker
// The frontend loads reviews separately so the main profile loads faster
// (this is called "lazy loading" — only fetch reviews when the user scrolls to them)
router.get("/:id/reviews", getWorkerReviews);

module.exports = router;
