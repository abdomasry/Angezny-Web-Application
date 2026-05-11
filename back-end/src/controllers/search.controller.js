const WorkerServices = require("../models/Worker.Services");
const Category = require("../models/Category");
const SearchLog = require("../models/SearchLog");

// ============================================================
// GET /api/search/suggest?q=<query>
// ============================================================
// Autocomplete endpoint for the navbar search bar.
//
// Returns two small lists so the UI can render a dropdown with
// suggestions grouped by type:
//   { services: [{ _id, name, categoryId, categoryName }], categories: [{ _id, name }] }
// ============================================================

// Escape regex-special characters in the user query so we can safely
// use it inside a RegExp. Without this, input like "a(b" would throw.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const suggest = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    // Empty query → empty suggestions. Saves a DB round-trip on every keystroke
    // when the user clears the input.
    if (!q) {
      return res.json({ services: [], categories: [] });
    }

    const pattern = new RegExp(escapeRegex(q), "i");
    // For longer queries (3+ chars), also match against description so the
    // suggestion list surfaces services that don't have the term in their
    // name. Short queries stay name-only to keep autocomplete focused.
    const matchService = q.length >= 3
      ? { $or: [{ name: pattern }, { description: pattern }] }
      : { name: pattern };
    const matchCategory = q.length >= 3
      ? { $or: [{ name: pattern }, { description: pattern }] }
      : { name: pattern };

    // Run both queries in parallel with Promise.all — they don't depend on each other
    const [services, categories] = await Promise.all([
      WorkerServices.find({
        ...matchService,
        active: true,
        approvalStatus: "approved",
      })
        .populate("categoryId", "name")
        .select("name categoryId")
        .limit(5)
        .lean(),

      Category.find({
        ...matchCategory,
        isActive: true,
      })
        .select("name")
        .limit(5)
        .lean(),
    ]);

    res.json({
      services: services.map((s) => ({
        _id: s._id,
        name: s.name,
        categoryId: s.categoryId?._id || null,
        categoryName: s.categoryId?.name || null,
      })),
      categories: categories.map((c) => ({ _id: c._id, name: c.name })),
    });
  } catch (error) {
    console.error("search suggest error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};

// ============================================================
// POST /api/search/log
// ============================================================
// Called by the frontend when a user COMMITS to a search — either
// by selecting a suggestion or hitting Enter on the input. We
// deliberately don't log every keystroke (see model comments).
//
// Body: { query: string, kind?: "service" | "category" | "text" }
// ============================================================
const logSearch = async (req, res) => {
  try {
    const { query, kind } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ message: "query is required" });
    }

    // Fire and forget — but we still await so errors surface in the response.
    await SearchLog.create({
      query: query.trim(),
      kind: ["service", "category", "text"].includes(kind) ? kind : "text",
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("logSearch error:", error);
    res.status(500).json({ message: "Server error logging search" });
  }
};

// ============================================================
// GET /api/search/top?limit=3
// ============================================================
// Returns the most-searched queries in the last 30 days (the TTL window).
// Powers the "الأكثر بحثاً" chips on the home page.
//
// If we have fewer logged queries than requested (e.g. brand-new site),
// we pad with the top categories by active-service count so the UI is
// never empty.
// ============================================================
const topSearches = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 3, 10);

    // Aggregate log entries: group by query, sort by count desc, limit.
    const topLogged = await SearchLog.aggregate([
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: limit },
    ]);

    let items = topLogged.map(r => ({ query: r._id, count: r.count }));

    // Fallback / padding: if not enough logged searches, fill with category
    // names that have the most active services. Gives the home page meaningful
    // chips even before any user has searched yet.
    if (items.length < limit) {
      const need = limit - items.length;
      const popularCats = await WorkerServices.aggregate([
        { $match: { active: true } },
        { $group: { _id: "$categoryId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: need + items.length }, // over-fetch, then dedupe below
        { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "cat" } },
        { $unwind: "$cat" },
        { $project: { _id: 0, name: "$cat.name" } },
      ]);

      // Don't add a category name that's already in our logged list
      const existingNames = new Set(items.map(i => i.query.toLowerCase()));
      for (const c of popularCats) {
        if (items.length >= limit) break;
        if (!existingNames.has(c.name.toLowerCase())) {
          items.push({ query: c.name, count: 0 });
          existingNames.add(c.name.toLowerCase());
        }
      }
    }

    res.json({ items });
  } catch (error) {
    console.error("topSearches error:", error);
    res.status(500).json({ message: "Server error fetching top searches" });
  }
};

module.exports = { suggest, logSearch, topSearches };
