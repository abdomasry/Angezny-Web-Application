const Category = require("../models/Category");
const WorkerServices = require("../models/Worker.Services");

// ========== READ operations (public — no auth needed) ==========

// getAll — Returns all active categories
// Used by: home page to display category cards
const getAll = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).lean();

    if (req.query.withCounts === "true") {
      // One aggregation query: group active services by categoryId, sum counts.
      const counts = await WorkerServices.aggregate([
        { $match: { active: true, approvalStatus: "approved", isPrivate: { $ne: true } } },
        { $group: { _id: "$categoryId", count: { $sum: 1 } } },
      ]);

      // Build an id-keyed lookup so each category gets its count in O(1).
      const countMap = new Map(counts.map(c => [String(c._id), c.count]));
      categories.forEach(cat => {
        cat.serviceCount = countMap.get(String(cat._id)) || 0;
      });
    }

    res.json({ categories });
  } catch (error) {
    console.error("category getAll error:", error);
    res.status(500).json({ message: "Server error, please try again" });
  }
};

// getById — Returns a single category by its MongoDB _id
// Used by: services page to show the selected category name
const getById = async (req, res) => {
  try {
    // req.params.id comes from the URL: /api/categories/:id
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ category });
  } catch (error) {
    res.status(500).json({ message: "Server error, please try again" });
  }
};

// ========== WRITE operations (admin only — auth + admin middleware required) ==========

// create — Creates a new category
// The route will have: authMiddleware → adminOnly → create
// So by the time we get here, we KNOW the user is a logged-in admin.
const create = async (req, res) => {
  try {
    const { name, description, image } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const category = await Category.create({ name, description, image });

    // 201 = "Created" — the standard status code when a new resource is created
    res.status(201).json({ category });
  } catch (error) {
    res.status(500).json({ message: "Server error, please try again" });
  }
};

// update — Updates an existing category
const update = async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ category });
  } catch (error) {
    res.status(500).json({ message: "Server error, please try again" });
  }
};

// deleteCategory — Deletes a category permanently
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error, please try again" });
  }
};

module.exports = { getAll, getById, create, update, deleteCategory };
