// =============================================================================
// Rate-limit middleware factories
// =============================================================================

const rateLimit = require("express-rate-limit");

// Bilingual error envelope so the front-end can show the message as-is.
// The `keyGenerator` defaults to req.ip which is what we want.
const tooManyRequests = (message) => (req, res /*, next, options */) => {
  res.status(429).json({ message });
};

// Stricter limiter for credential-related endpoints.
// 10 attempts / 15 min / IP — slow enough to make brute force impractical
// without blocking a legitimate user who mistypes their password a few times.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: "draft-7", // sets RateLimit-* response headers
  legacyHeaders: false,
  handler: tooManyRequests(
    "محاولات كثيرة جداً — يرجى المحاولة بعد 15 دقيقة.",
  ),
});

// Even stricter for endpoints that trigger an email or SMS (attacker can
// otherwise weaponize them to spam a victim's inbox).
const emailFloodLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: tooManyRequests(
    "تم إرسال طلبات كثيرة — يرجى المحاولة بعد 15 دقيقة.",
  ),
});

// Looser limiter for ticket creation — legitimate users may submit several
// tickets in a session; abuse looks like dozens per hour.
const supportCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: tooManyRequests(
    "تم إنشاء عدد كبير من البلاغات في وقت قصير — حاول لاحقاً.",
  ),
});

module.exports = {
  authLimiter,
  emailFloodLimiter,
  supportCreateLimiter,
};
