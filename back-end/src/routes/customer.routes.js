// ============================================================
// Customer Routes
// ============================================================
// This file defines the URL paths for customer profile operations
// and connects each path to its controller function.

const express = require("express");
const router = express.Router();
const {
  getProfile,
  updateProfile,
  getOrders,
  addAddress,
  updateAddress,
  deleteAddress,
  toggleFavoriteWorker,
} = require("../controllers/customer.controller");
const authMiddleware = require("../middleware/auth.middleware");

// All routes require authentication (authMiddleware runs first)
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);
router.get("/orders", authMiddleware, getOrders);

// Address management — operates on CustomerProfile.addresses
router.post("/addresses", authMiddleware, addAddress);
router.put("/addresses/:id", authMiddleware, updateAddress);
router.delete("/addresses/:id", authMiddleware, deleteAddress);

// Favorite workers — single toggle endpoint
router.post("/favorites/workers/:workerId", authMiddleware, toggleFavoriteWorker);

module.exports = router;
