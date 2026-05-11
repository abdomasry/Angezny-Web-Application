// ============================================================
// Favorites Routes
// ============================================================
// All endpoints are auth-required (you can only manage your own list).
// No role gate — workers and admins can also save favorites if they want.
// ============================================================

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const {
  listFavorites,
  addFavorite,
  removeFavorite,
} = require("../controllers/favorites.controller");

router.get("/", auth, listFavorites);
router.post("/:workerId", auth, addFavorite);
router.delete("/:workerId", auth, removeFavorite);

module.exports = router;
