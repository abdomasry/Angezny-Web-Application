// aiRateLimit.js — in-memory per-user rate limiter for AI assistant calls.
//
// Why in-memory and not DB-backed:
//   - The limits are advisory, not security-critical (a server restart
//     resetting buckets is acceptable for v1).
//   - Every AI message already does a network round-trip to Groq, so
//     adding a Mongo round-trip per call would noticeably slow things down.
//   - Single backend process today. If/when we shard the API server, we'd
//     swap this for a Redis-backed implementation with the same surface.
//
// State shape per user:
//   {
//     hourBucket: number,  // epoch hour (Math.floor(Date.now() / HOUR_MS))
//     hourCount:  number,
//     dayBucket:  number,  // epoch day  (Math.floor(Date.now() / DAY_MS))
//     dayCount:   number,
//   }
// When the current epoch hour/day passes the stored bucket, the counter
// resets — no background cron needed; the rollover is lazy.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const buckets = new Map();

// Read limits at call time (not module load) so changing the .env doesn't
// require a code edit to apply the new value on the next restart.
function getLimits() {
  return {
    hour: Math.max(1, parseInt(process.env.AI_RATE_LIMIT_HOUR, 10) || 20),
    day: Math.max(1, parseInt(process.env.AI_RATE_LIMIT_DAY, 10) || 100),
  };
}

// Check the limits AND increment the counters atomically. Returns:
//   { allowed: true }                            — under the limit
//   { allowed: false, scope, retryAfterSec }     — over; UI shows toast
//
// We increment only when allowed. Failed calls (Groq errored, classifier
// rejected, etc.) still count — they consumed a slot of the user's quota
// and shouldn't be retried infinitely.
function checkAndIncrement(userId) {
  const key = String(userId);
  const now = Date.now();
  const hourBucket = Math.floor(now / HOUR_MS);
  const dayBucket = Math.floor(now / DAY_MS);

  const limits = getLimits();
  const existing = buckets.get(key);

  // Reset if we've crossed an hour/day boundary.
  const state = existing
    ? {
        hourBucket: existing.hourBucket === hourBucket ? existing.hourBucket : hourBucket,
        hourCount: existing.hourBucket === hourBucket ? existing.hourCount : 0,
        dayBucket: existing.dayBucket === dayBucket ? existing.dayBucket : dayBucket,
        dayCount: existing.dayBucket === dayBucket ? existing.dayCount : 0,
      }
    : { hourBucket, hourCount: 0, dayBucket, dayCount: 0 };

  if (state.hourCount >= limits.hour) {
    const retryAfterSec = Math.max(1, Math.ceil(((hourBucket + 1) * HOUR_MS - now) / 1000));
    buckets.set(key, state);
    return { allowed: false, scope: "hour", retryAfterSec };
  }
  if (state.dayCount >= limits.day) {
    const retryAfterSec = Math.max(1, Math.ceil(((dayBucket + 1) * DAY_MS - now) / 1000));
    buckets.set(key, state);
    return { allowed: false, scope: "day", retryAfterSec };
  }

  state.hourCount += 1;
  state.dayCount += 1;
  buckets.set(key, state);
  return { allowed: true };
}

module.exports = { checkAndIncrement };
