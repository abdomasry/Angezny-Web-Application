const express = require("express");
const router = express.Router();
const {
  getAll,
  getById,
  create,
  update,
  deleteCategory,
} = require("../controllers/category.controller");
const authMiddleware = require("../middleware/auth.middleware");
const adminOnly = require("../middleware/admin.middleware");

// Public routes — anyone can view categories 
// These are used by the home page and services page
router.get("/", getAll);
router.get("/:id", getById);

// Admin-only routes — middleware chain: authMiddleware → adminOnly → controller
router.post("/", authMiddleware, adminOnly, create);
router.put("/:id", authMiddleware, adminOnly, update);
router.delete("/:id", authMiddleware, adminOnly, deleteCategory);

module.exports = router;
