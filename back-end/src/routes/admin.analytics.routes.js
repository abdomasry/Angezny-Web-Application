// Admin analytics routes — mounted at /api/admin/analytics.
// Every endpoint here is read-only, so no rate-limiting / write guards
// beyond auth + admin role. All endpoints accept ?range=today|7d|30d|90d|all.

const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/admin.analytics.controller");
const authMiddleware = require("../middleware/auth.middleware");
const adminOnly = require("../middleware/admin.middleware");

router.use(authMiddleware, adminOnly);

// Group 1 — Orders, Categories & Bestsellers
router.get("/overview", ctrl.getOverview);
router.get("/orders-trend", ctrl.getOrdersTrend);
router.get("/orders-status", ctrl.getOrdersStatus);
router.get("/top-categories", ctrl.getTopCategories);
router.get("/top-services", ctrl.getTopServices);
router.get("/top-workers", ctrl.getTopWorkers);
router.get("/cancellation-reasons", ctrl.getCancellationReasons);

// Group 2 — Geography
router.get("/orders-by-governorate", ctrl.getOrdersByGovernorate);
router.get("/orders-by-city", ctrl.getOrdersByCity);
router.get("/demand-supply-gap", ctrl.getDemandSupplyGap);

// Group 3 — Customers & Revenue
router.get("/top-customers", ctrl.getTopCustomers);
router.get("/customer-retention", ctrl.getCustomerRetention);
router.get("/revenue-trend", ctrl.getRevenueTrend);
router.get("/revenue-split", ctrl.getRevenueSplit);
router.get("/payment-methods", ctrl.getPaymentMethods);
router.get("/refund-rate", ctrl.getRefundRate);

// Group 4 — Marketing & Quality
router.get("/coupons", ctrl.getCouponsAnalytics);
router.get("/top-search-terms", ctrl.getTopSearchTerms);
router.get("/reports-by-category", ctrl.getReportsByCategory);
router.get("/avg-completion-time", ctrl.getAvgCompletionTime);

module.exports = router;
