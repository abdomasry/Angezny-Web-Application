const express = require("express");
const router = express.Router();
const {
  listCoupons, getStats, createCoupon, updateCoupon, deleteCoupon, getFeatured, validate,
} = require("../controllers/coupon.controller");
const authMiddleware = require("../middleware/auth.middleware");
const adminOnly = require("../middleware/admin.middleware");

// Public — home-page banner fetches this.
router.get("/featured", getFeatured);

// Customer-auth — /checkout calls this when the user clicks "Apply coupon".
router.post("/validate", authMiddleware, validate);

// Admin management routes. Mounted separately from /api/admin so we can keep
// coupon-specific logic in its own controller.
router.get("/",         authMiddleware, adminOnly, listCoupons);
router.get("/stats",    authMiddleware, adminOnly, getStats);
router.post("/",        authMiddleware, adminOnly, createCoupon);
router.put("/:id",      authMiddleware, adminOnly, updateCoupon);
router.delete("/:id",   authMiddleware, adminOnly, deleteCoupon);

module.exports = router;
