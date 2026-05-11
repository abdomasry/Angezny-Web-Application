// =============================================================================
// Pagination helpers — shared across every paginated controller
// =============================================================================

/**
 * Parse `page` and `limit` from `req.query` with bounds.
 *
 * @param {object} req                  Express request
 * @param {object} [opts]
 * @param {number} [opts.defaultLimit]  Used when ?limit is absent. Default 10.
 * @param {number} [opts.maxLimit]      Hard cap to prevent expensive queries
 *                                      from a malicious / mistaken client.
 *                                      Default 100.
 * @returns {{ page: number, limit: number, skip: number }}
 */
function parsePagination(req, { defaultLimit = 10, maxLimit = 100 } = {}) {
  // Math.max(1, …) guarantees page ≥ 1 even when the client passes 0 or -5.
  const rawPage = parseInt(req.query.page, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawLimit = parseInt(req.query.limit, 10);
  const requested = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit;
  const limit = Math.min(maxLimit, requested);

  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Build the standard pagination envelope returned to the client.
 * Keeps the shape identical across every endpoint.
 */
function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    // `|| 0` so an empty result returns `pages: 0` (not NaN) — easier on the
    // frontend's "if (pagination.pages > 1)" guard.
    pages: Math.ceil(total / limit) || 0,
  };
}

module.exports = { parsePagination, paginationMeta };
