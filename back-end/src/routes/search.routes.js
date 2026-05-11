const express = require("express");
const router = express.Router();
const { suggest, logSearch, topSearches } = require("../controllers/search.controller");

// All search routes are public — no auth required.
// Guests searching the site should still get suggestions and trigger logging.
router.get("/suggest", suggest);
router.post("/log", logSearch);
router.get("/top", topSearches);

module.exports = router;
