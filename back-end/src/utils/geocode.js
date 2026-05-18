// Server-side reverse-geocoding via Nominatim.
//
// Used in two places:
//   1. As a background fallback in the order controllers — when the
//      customer's browser couldn't (or didn't) resolve a governorate
//      from the pin, the server fills it in after the order is saved.
//   2. The one-shot backfill script that fixes legacy orders which
//      have lat/lng but no governorate / city.
//
// Nominatim's public endpoint requires:
//   • a real User-Agent identifying the app (browsers do this implicitly;
//     server-to-server we must set it ourselves — without it requests get
//     blocked).
//   • a hard cap of 1 request per second. We serialize calls through a
//     single in-process promise chain to enforce this regardless of how
//     many callers fire in parallel.

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  "craftsmen-marketplace/1.0 (admin analytics backfill)";
const MIN_INTERVAL_MS = 1100; // a hair over 1s for safety

// Canonical 27 Egyptian governorates. Kept in sync with the frontend list
// at front-end/lib/constants/governorates.ts — `ar` is the value we store.
const EGYPTIAN_GOVERNORATES = [
  { slug: "cairo", ar: "القاهرة", en: "Cairo" },
  { slug: "giza", ar: "الجيزة", en: "Giza" },
  { slug: "alexandria", ar: "الإسكندرية", en: "Alexandria" },
  { slug: "qalyubia", ar: "القليوبية", en: "Qalyubia" },
  { slug: "sharqia", ar: "الشرقية", en: "Sharqia" },
  { slug: "dakahlia", ar: "الدقهلية", en: "Dakahlia" },
  { slug: "beheira", ar: "البحيرة", en: "Beheira" },
  { slug: "minya", ar: "المنيا", en: "Minya" },
  { slug: "gharbia", ar: "الغربية", en: "Gharbia" },
  { slug: "sohag", ar: "سوهاج", en: "Sohag" },
  { slug: "asyut", ar: "أسيوط", en: "Asyut" },
  { slug: "monufia", ar: "المنوفية", en: "Monufia" },
  { slug: "kafr-el-sheikh", ar: "كفر الشيخ", en: "Kafr El Sheikh" },
  { slug: "fayoum", ar: "الفيوم", en: "Fayoum" },
  { slug: "qena", ar: "قنا", en: "Qena" },
  { slug: "beni-suef", ar: "بني سويف", en: "Beni Suef" },
  { slug: "ismailia", ar: "الإسماعيلية", en: "Ismailia" },
  { slug: "aswan", ar: "أسوان", en: "Aswan" },
  { slug: "damietta", ar: "دمياط", en: "Damietta" },
  { slug: "luxor", ar: "الأقصر", en: "Luxor" },
  { slug: "port-said", ar: "بورسعيد", en: "Port Said" },
  { slug: "suez", ar: "السويس", en: "Suez" },
  { slug: "matrouh", ar: "مطروح", en: "Matrouh" },
  { slug: "north-sinai", ar: "شمال سيناء", en: "North Sinai" },
  { slug: "south-sinai", ar: "جنوب سيناء", en: "South Sinai" },
  { slug: "new-valley", ar: "الوادي الجديد", en: "New Valley" },
  { slug: "red-sea", ar: "البحر الأحمر", en: "Red Sea" },
];

// Map a free-form string (typically Nominatim's `address.state` — values
// like "محافظة القاهرة" or "Cairo Governorate") to the canonical Arabic
// name. Returns null when nothing matches.
function normalizeGovernorate(raw) {
  if (!raw) return null;
  const cleaned = String(raw)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^محافظة\s+/i, "")
    .replace(/\s+Governorate$/i, "")
    .trim()
    .toLowerCase();
  if (!cleaned) return null;
  const hit = EGYPTIAN_GOVERNORATES.find(
    (g) =>
      g.ar.toLowerCase() === cleaned ||
      g.en.toLowerCase() === cleaned ||
      g.slug.toLowerCase() === cleaned,
  );
  return hit ? hit.ar : null;
}

// Single-flight rate limiter. Every call to `reverseGeocode` chains off the
// previous one, ensuring we never exceed Nominatim's 1 req/s budget even
// when several order writes land at the same time. The chain is global to
// the Node process — fine for our single-instance deployment.
let chain = Promise.resolve();
let lastCallAt = 0;

function rateLimitedFetch(url) {
  const next = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCallAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        // Nominatim recommends Accept-Language for localized place names.
        "Accept-Language": "ar",
      },
    });
  });
  // Keep the chain advancing even if this call throws — otherwise one
  // network error stalls every subsequent caller forever.
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// Reverse-geocode {lat, lng} and return `{governorate, city}`. Returns
// null on any failure (network, non-2xx, malformed JSON, no useful
// fields) — callers should treat null as "skip, try again later".
async function reverseGeocode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ar`;
  try {
    const res = await rateLimitedFetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const city =
      a.city || a.town || a.village || a.municipality || a.county || "";
    const governorate = normalizeGovernorate(a.state);
    if (!city && !governorate) return null;
    return {
      governorate: governorate || null,
      city: city ? String(city).slice(0, 80) : null,
    };
  } catch (err) {
    return null;
  }
}

module.exports = { reverseGeocode, normalizeGovernorate };
