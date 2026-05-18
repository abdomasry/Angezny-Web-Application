// The 27 Egyptian governorates with Arabic + English names.
// Used in: address forms (worker onboarding, customer address book, order
// checkout) and the admin analytics governorate filter.
//
// `value` is what we persist to the DB (the Arabic name — that's what users
// see when they pick from the select). If we ever need a stable code (e.g.
// for analytics joins across systems), we can switch `value` to the slug.

export const EGYPTIAN_GOVERNORATES = [
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
] as const;

export type Governorate = (typeof EGYPTIAN_GOVERNORATES)[number];

// Map a free-form string (typically Nominatim's `address.state` field, but
// also handles user-typed input) to the canonical Arabic value we store in
// the DB. Nominatim returns things like "محافظة القاهرة" or "Cairo
// Governorate"; we want "القاهرة" so analytics joins line up with the value
// workers pick from the dropdown.
//
// Returns null when nothing matches — caller decides whether to fall back
// to `null` (leaves the field unset) or to a literal "غير محدد".
export function normalizeGovernorate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Trim, collapse internal whitespace, strip the Arabic "محافظة " prefix
  // and the English " Governorate" suffix that Nominatim adds.
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
