// ai-knowledge.js — structured Q&A knowledge base for the AI assistant.
//
// The main groq.service.js exposes a `getPlatformInfo(topic)` tool that the
// model calls when the user asks a how-to / what-is question. Returning
// only the requested topic (instead of dumping everything into the system
// prompt) keeps input tokens low and avoids the "repeat the same paragraph
// every turn" failure mode.
//
// Each entry has:
//   - topic:       short stable key the model passes to the tool
//   - aliases:     alternate keys the model might guess (we accept any)
//   - title:       human-readable label, returned to the model for citation
//   - content:     concise bilingual answer the model can paraphrase. Keep
//                  it FACTUAL — no marketing fluff. The model adds the
//                  conversational wrapper itself.
//
// To extend the assistant's knowledge, ADD a new entry here — no schema
// changes, no migrations, no model retraining.

const TOPICS = [
  // ─── Support & contact ────────────────────────────────────
  {
    topic: "contact_support",
    aliases: ["support", "help", "ticket", "report", "complain", "issue", "اتصال", "دعم", "شكوى", "تذكرة"],
    title: "التواصل مع الدعم / Contact support",
    content: `Customers and workers contact support by opening a ticket at /support (header link "الدعم"). Steps:
1. Go to /support
2. Click "تذكرة جديدة" (new ticket)
3. Pick a type: service_issue, user_report, technical, payment_issue, or other
4. Add a title (max 150 chars) and a detailed message. Attach images/files if useful.
5. Submit — the ticket status starts as "open". An admin replies inside the ticket thread.
6. Track your tickets at /support — open, in_progress, resolved, closed.

Response time: usually within 24 hours on weekdays. Urgent payment/safety issues get prioritized.
No phone number — all support is via tickets so there's a written record.`,
  },

  // ─── Booking ──────────────────────────────────────────────
  {
    topic: "how_to_book",
    aliases: ["book", "order", "request", "hire", "حجز", "طلب"],
    title: "كيفية حجز خدمة / How to book a service",
    content: `Booking flow (customer):
1. Browse /services (all services) or /providers (worker profiles), or use search in the navbar.
2. Open a service card or worker profile.
3. Click "اطلب الخدمة" (request service) on the service you want.
4. Fill the request: scheduled date/time, address, description, optional coupon code, payment mode (cash on delivery or card).
5. Submit. The worker is notified and can accept or reject.
6. Order status flow: pending → accepted → in_progress → completed (or cancelled / rejected).
7. After completion you can review the worker at /dashboard.

Tip: you can also chat with the worker first via "اسأل" before booking.`,
  },

  // ─── Payments ─────────────────────────────────────────────
  {
    topic: "payments",
    aliases: ["payment", "pay", "card", "cash", "paymob", "instapay", "wallet", "دفع", "بطاقة"],
    title: "الدفع / Payment options",
    content: `Two payment modes per order:
- Cash on delivery (الدفع عند الاستلام): pay the worker in cash when service is done.
- Card / Wallet / InstaPay via Paymob: hosted checkout at /checkout. Supports Visa, Mastercard, Meeza, mobile wallets, and InstaPay.

Payment timing:
- Services with paymentTiming="before" require payment up-front when booking.
- Services with paymentTiming="after" are paid after completion.

Currency: Egyptian Pounds (ج.م / EGP). All prices are pre-tax displayed.
Saved cards: managed at /profile/edit → payment methods (only last 4 digits stored).
Refunds: opened via a support ticket of type "payment_issue".`,
  },

  // ─── Becoming a worker ────────────────────────────────────
  {
    topic: "become_worker",
    aliases: ["become_provider", "register_worker", "join", "apply", "احتراف", "مزود", "حرفي"],
    title: "كيف تصبح مزود خدمة / Become a worker",
    content: `Anyone can apply to offer services:
1. Go to /become-provider (link in navbar / footer).
2. Fill the application: category, title (tagline), skills, working hours, location, optional license/certificates.
3. Submit — application enters "pending" review by admins.
4. Admins verify (verificationStatus: pending → approved or rejected). You'll get a notification.
5. Once approved, your role becomes "worker" and you can add services at /dashboard.
6. Each service you add goes through its own approvalStatus: pending → approved (then it appears publicly).

You start at rank "bronze" and progress (silver → gold → platinum → diamond) as you complete more orders with good reviews.`,
  },

  // ─── Chat ─────────────────────────────────────────────────
  {
    topic: "chat",
    aliases: ["message", "messaging", "talk", "contact_worker", "محادثة", "رسالة"],
    title: "الدردشة / Chat",
    content: `Real-time chat at /messages (or the floating bubble at the bottom-left of any page):
- Start a chat by clicking "اسأل" on any service card or worker profile.
- Send text, images, and files (PDF, DOC, etc.).
- See online/offline status and read receipts (✓ delivered, ✓✓ read).
- Typing indicators show when the other side is typing.
- Conversations persist forever — scroll back any time.
- The pinned 🤖 "المساعد الذكي" conversation at the top is THIS AI assistant.`,
  },

  // ─── Cancellation ─────────────────────────────────────────
  {
    topic: "cancellation",
    aliases: ["cancel", "refund", "إلغاء", "استرداد"],
    title: "إلغاء الطلب / Cancelling an order",
    content: `Orders can be cancelled at different stages:
- Pending: cancel freely from /dashboard before the worker accepts.
- Accepted / In progress: open a cancellation request — the worker must approve or deny.
  - If they approve, the order is cancelled and any prepayment is refunded (3-7 business days).
  - If they deny, you can escalate via support ticket (type: service_issue).
- Completed orders cannot be cancelled — open a support ticket instead.

Workers can also request cancellation; the same approval flow applies in reverse.`,
  },

  // ─── Reviews ──────────────────────────────────────────────
  {
    topic: "reviews",
    aliases: ["review", "rating", "rate", "تقييم"],
    title: "التقييمات / Reviews",
    content: `After an order is marked "completed":
- Customer can rate the worker 1-5 stars + leave a comment at /dashboard.
- Worker can rate the customer too (worker→customer review). This shows on the customer's public profile but is hidden from the customer themselves.
- Reviews are immutable once submitted (to prevent retaliation). Edit window: none.
- Workers' visible rating is the average of all customer reviews; it influences ranking and rank progression (bronze → diamond).`,
  },

  // ─── Account ──────────────────────────────────────────────
  {
    topic: "account",
    aliases: ["profile", "settings", "email", "password", "verify", "حساب", "ملف"],
    title: "الحساب / Account management",
    content: `Manage your account from /profile and /profile/edit:
- Update name, phone, profile image, bio, location, notification preferences.
- Verify your email: a code is sent to your inbox on signup; resend from /verify-email.
- Reset password: /forgot-password → email link → /reset-password.
- Phone-only signups are unverified until they add and verify an email.
- Sign in with Google or Facebook is supported (/signin).
- Delete account: open a support ticket (type: other) — admins process within 7 days.`,
  },

  // ─── Favorites ────────────────────────────────────────────
  {
    topic: "favorites",
    aliases: ["favorite", "heart", "save", "bookmark", "مفضلة"],
    title: "المفضلة / Favorites",
    content: `Tap the heart icon ❤️ on any worker profile or service card to favorite. View all favorites at /favorites. Favorites are private and used by the recommendation engine to surface similar workers in your area.`,
  },

  // ─── Coupons ──────────────────────────────────────────────
  {
    topic: "coupons",
    aliases: ["coupon", "discount", "promo", "كوبون", "خصم"],
    title: "كوبونات الخصم / Coupon codes",
    content: `If you have a coupon code, enter it in the "Coupon code" field on the booking/checkout page. Discount applies to the order subtotal before payment. One coupon per order. Some coupons are single-use per customer; others are category- or worker-specific. Expired or invalid codes get a clear error inline.`,
  },

  // ─── Worker wallet & payouts ──────────────────────────────
  {
    topic: "wallet",
    aliases: ["payout", "withdraw", "earnings", "balance", "محفظة", "سحب", "أرباح"],
    title: "محفظة الحرفي / Worker wallet & payouts",
    content: `Workers only — view earnings at /dashboard → wallet:
- Balance: withdrawable amount (credited after each completed order, minus platform fee).
- Lifetime earnings: total credited ever.
- Lifetime withdrawn: total paid out.

Set up payout destination at dashboard → payouts: choose method (bank transfer, InstaPay alias, or mobile wallet) and fill the matching details.
Request a withdrawal from the wallet page. Paymob Payouts processes it (sandbox uses mock mode in dev). Allow 1-3 business days for funds to arrive.`,
  },

  // ─── Pricing types ────────────────────────────────────────
  {
    topic: "pricing_types",
    aliases: ["price", "pricing", "cost", "تسعير", "سعر"],
    title: "أنواع التسعير / Pricing models",
    content: `Each service uses one of four pricing models:
- Fixed (ثابت): one flat price for the whole service.
- Hourly (بالساعة): price per hour; final cost depends on duration.
- Range (نطاق): a min-max range; the worker confirms the exact price before starting.
- Custom (مخصص): a free-text description (e.g. "depends on site survey"). No fixed number until the worker quotes.

The pricing model is shown on every service card. Currency: EGP.`,
  },

  // ─── Notifications ────────────────────────────────────────
  {
    topic: "notifications",
    aliases: ["notification", "alerts", "bell", "إشعارات"],
    title: "الإشعارات / Notifications",
    content: `In-app notifications appear in the bell icon at the top of every page (and at /notifications). You get notified for: new messages, order status changes, ticket replies, review prompts, and platform announcements.

Toggle categories on/off at /profile/edit → notification preferences:
- orders: order status updates
- messages: chat messages
- promotions: deals and offers
Email notifications go to the verified email on file.`,
  },

  // ─── Safety & disputes ────────────────────────────────────
  {
    topic: "safety",
    aliases: ["dispute", "report", "block", "scam", "أمان", "نصب", "إبلاغ"],
    title: "الأمان والإبلاغ / Safety & reporting",
    content: `If a worker or customer behaves inappropriately:
- Block them: profile page → "حظر" — they can no longer message you.
- Report them: open a support ticket of type "user_report" with details and any screenshots.
Admins review reports within 24h. Confirmed violations lead to warnings, suspension, or permanent ban.
For payment-related disputes use type "payment_issue".
Never share OTP codes, passwords, or bank PINs with anyone — Angezny staff will NEVER ask for them.`,
  },
];

// Build a lookup index keyed by topic + every alias. Both keys are
// lowercase-trimmed so the model's input doesn't have to match case.
const INDEX = new Map();
for (const entry of TOPICS) {
  INDEX.set(entry.topic.toLowerCase(), entry);
  for (const alias of entry.aliases || []) {
    INDEX.set(alias.toLowerCase(), entry);
  }
}

// Return all topic keys + titles so the system prompt can list them.
function listTopics() {
  return TOPICS.map(t => ({ topic: t.topic, title: t.title }));
}

// Resolve a topic the model asked for. Falls back to a fuzzy substring
// match so "support" still hits "contact_support" even if it's not an
// alias. Returns null if nothing matches — the tool runner will surface
// that to the model which can then redirect the user.
function getTopic(query) {
  if (!query) return null;
  const key = String(query).trim().toLowerCase();
  const exact = INDEX.get(key);
  if (exact) return exact;
  // Substring fallback: try each registered key.
  for (const [k, entry] of INDEX) {
    if (k.includes(key) || key.includes(k)) return entry;
  }
  return null;
}

module.exports = { listTopics, getTopic };
