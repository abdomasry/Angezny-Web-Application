const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const {
  getCustomerById,
  getCustomerReviews,
} = require("../controllers/customer-public.controller");

router.get("/:id", auth, getCustomerById);
router.get("/:id/reviews", auth, getCustomerReviews);

module.exports = router;
