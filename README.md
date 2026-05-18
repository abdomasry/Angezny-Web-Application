#  انجزني · Angezny 

An Arabic-first, RTL craftsmen / home-services marketplace for the Egyptian market. Customers find and book workers (cleaning, plumbing, electrical, painting, AC, repairs, etc.); workers manage their listings, accept orders, and chat with customers in real time.

> Currency: ج.م (EGP). Roles: customer, worker, admin.

---
## link ---> https://angezny.vercel.app/
## Existed Users
| Email | Password |
|------|------|
| admin@admin.com | 123456 |
| worker@worker.com | 123456 |
| customer@customer.com | 123456 |

or add someone by yourself :)



## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui, Radix UI, Lucide icons |
| Backend | Node.js + Express 5, Mongoose 9 |
| Database | MongoDB (Atlas) |
| Auth | JWT (7-day expiry), bcrypt password hashing |
| Real-time | Socket.IO (chat + presence + notifications) |
| Payments | Paymob (card / wallet checkout) + cash-on-delivery |
| Email | Brevo — verification + password reset |
| File uploads | Cloudinary (unsigned uploads from the browser) |
| Maps | Leaflet + OpenStreetMap (Nominatim geocoding) |
| i18n | next-intl (Arabic / English, RTL) |

---

## Features

### Authentication & Accounts
- Sign up by email or phone, with role selection (customer / worker)
- Email verification with 6-digit code + resend
- Phone-based signup (skips email verification)
- Sign in with email or phone + password
- OAuth sign in (Google)
- Password reset flow (token-validated email link)
- JWT-based session (7-day expiry), bcrypt password hashing
- Rate-limited auth endpoints (login, signup, password reset, email send)
- Account states: active / suspended / banned (enforced on login)

### Customer Features

**Profile & account**
- Personal info (name, email, phone, bio, preferred language)
- Avatar upload with image cropping
- Verification status badge, member-since date

**Addresses**
- Multiple saved addresses with labels (Home / Office / …)
- Map-based address picker (Leaflet)
- Reverse geocoding (Nominatim) for human-readable address
- GeoJSON Point coordinates stored per address
- Primary address designation, address CRUD

**Discovery & search**
- Browse workers and services with category, price-range, and rating filters
- Sort by rating, price, popularity, or alphabetical
- Geolocation-aware "Nearest" tab (browser permission, distance display)
- Live **distance counter** on the service detail page (km between customer and worker)
- Quick-filter tabs: All / Top-Rated / Verified / Nearest
- Debounced search autocomplete (services + categories)
- Top-searched terms surfaced on the home page
- Search history logged for analytics
- Featured categories grid and top providers carousel on home page

**Favorites**
- Add / remove workers to favorites (heart button on cards)
- Favorites list view with count

**Orders & bookings**
- Create order with service date/time picker
- Pick service location via map (address + lat/lng for worker precision)
- Order notes / comments
- Attach up to 5 **problem images** to an order so the worker sees the issue before arriving
- Submit **custom order requests** when no listed service fits (free-form description + price proposal)
- View active orders (pending, accepted, in-progress) and history (completed, cancelled, rejected)
- Cancel pending / accepted orders with optional reason
- Respond to worker cancellation requests
- View worker's completion report (text + images) after job done

**Reviews & ratings**
- Submit star rating + review text after order completion
- View worker reviews with pagination

**Payments & wallet**
- **Paymob** online checkout (card / mobile wallet) with hosted payment flow
- Save credit cards (Visa, Mastercard, Meeza) with brand icons
- Set default payment method
- Cash-on-delivery option
- Wallet balance and transaction history
- Withdrawal requests

**Coupons & discounts**
- Apply coupon codes at checkout (percentage or fixed amount)
- Featured coupon banner on home page (copy code)
- Category-restricted coupons, minimum-order rules
- Live discount calculation in checkout

**Checkout**
- Service summary (image, name, worker, price)
- Appointment date/time + map-picked location + notes
- Payment-method selection + coupon application
- Price total with discount breakdown

### Worker Features

**Profile**
- Avatar, professional title/tagline, bio, skills list
- Worker type (individual / company)
- Verification status, rank badge, completed-orders count

**Location**
- Map-based service-area picker, GeoJSON Point storage
- Update location endpoint

**Services management**
- Add / edit / delete services
- Service types: fixed price, hourly, price range
- Multiple service images (Cloudinary, max 6) — file or URL
- Category assignment per service
- Toggle active / inactive
- Admin approval flow: pending → approved / rejected (with reason)

**Portfolio gallery**
- Add portfolio items (title, description, completion date)
- Multiple images per item (max 8)
- Edit / delete portfolio items

**Pricing packages**
- Create custom packages (title, description, features list, price)
- Edit / delete packages

**Working hours**
- Set default working hours (from / to) and days off
- Day-by-day enable / disable, save schedule

**Licenses & credentials**
- Upload multiple licenses / certifications
- Edit (replace file), delete, toggle public visibility
- Admin approval queue with feedback per license

**Dashboard**
- Stats overview: pending orders, completed orders, total earnings, services count
- Active orders and history tabs

**Order management**
- Accept / reject pending orders (with reason)
- Mark in-progress, complete with report (text + up to 6 images)
- See customer-attached **problem images** on the order card
- Receive and price-quote **custom order requests** from customers
- Cancel accepted / in-progress orders, request customer approval
- Respond to customer cancellation requests
- View customer info, address text, and pinned location on map

**Earnings**
- Wallet balance + lifetime earnings
- Transaction history (paginated, credit/debit)
- Withdrawal requests

**Rate customers**
- Submit rating after order completion

### Admin Features

**Dashboard**
- Stats cards (users, services pending, orders, reports, verifications)

**User management**
- Search / filter users
- Activate / suspend / ban users
- View recent orders and worker profile per user

**Service approval**
- Queue of pending services with full details
- Approve (auto-updates worker categories) or reject with reason
- Handle resubmission of rejected services

**Verification & credentials**
- Worker verification request queue
- Multi-credential license review (approve / reject each)

**Reports & violations**
- View, categorize, and action user reports

**Orders**
- View all platform orders, admin status overrides, cancellation tracking
- **Order detail page** (`/admin/orders/[id]`): click any order row to drill into full timeline, customer + worker info, pinned location, problem images, and completion report

**Coupon management**
- Create coupons (percentage / fixed, min purchase / qty, max uses, expiry)
- Applicable-categories selector, status (active / paused)
- Mark as featured for home banner (title, subtitle, image, CTA)
- Per-coupon stats: uses, revenue generated, average discount
- Filter / search / edit / delete coupons

**Category management**
- Create / edit / delete categories with icon upload
- View service counts per category

**Analytics & reporting**
- Sales overview (totals, trend, status breakdown)
- Order trend and status distribution
- Top categories, top services, top workers
- Cancellation-reasons breakdown, refund-rate metrics
- Geographic analytics (orders by governorate / city)
- Demand-vs-supply gap analysis
- Customer analytics (top customers, retention)
- Revenue trend, payment-method distribution
- Coupon performance, search-term analytics
- Average completion time

**Support tickets**
- Review and reply to customer tickets
- Ticket status management

### Real-Time Chat
- Socket.IO live messaging (1-to-1 conversations)
- Find-or-create conversation between two users
- Text + file/image attachments (Cloudinary)
- Unread message count per conversation
- Last-message preview and timestamps
- Chat notifications, presence

### AI Assistant
- In-app **AI bot** that answers questions about the platform (how to book, payment, refunds, becoming a provider, etc.)
- Backed by a curated knowledge base (`ai-knowledge.js`) so replies stay on-topic
- Available from the chat widget alongside real worker conversations

### Notifications
- In-app bell with unread count and dropdown list
- Type-based color coding (orders, messages, promotions, admin alerts)
- Mark-all-as-read
- Auto-expire after 24h (Mongo TTL index)
- Notification preferences in customer settings

### Support
- Customer creates support tickets, replies, tracks status
- Rate-limited ticket creation (15 / hour)

### Search & Discovery (system)
- Suggestion API (services + categories), debounced client-side
- Search-log aggregation for trending terms
- Geospatial `$geoNear` queries for nearest-worker discovery
- Worker rank-score backfill script

### Home Page
- Hero, featured category grid, top providers
- Most-searched terms strip
- Featured-coupon promo banner
- "Become a provider" CTA
- Search bar with autocomplete

### UI / UX
- Arabic-first RTL layout, Arabic / English i18n
- Mobile bottom nav (4 tabs), tablet + desktop responsive
- Glass-morphism navbar, gradient accents, bento-grid animations
- Dark-mode tokens (in `globals.css`)
- Skeleton loaders, toasts, modal dialogs, inline confirmations
- Form validation (React Hook Form + Zod) with error messages
- Accessibility labels and ARIA attributes

### Backend Infrastructure
- Express 5 REST API mounted under `/api`
- Mongoose 9 with 16+ schemas
- Auth + role middleware (customer / worker / admin)
- Rate limiting (auth, email send, support tickets)
- Pagination utilities, aggregation pipelines
- GeoJSON 2dsphere indexes for geo queries
- Mongo TTL indexes (notifications 24h, search logs 30d)
- Socket.IO server with JWT handshake

### Frontend Infrastructure
- Next.js 16 App Router (TypeScript)
- Tailwind CSS 4, shadcn/ui, Radix primitives
- React Hook Form + Zod
- next-intl (ar / en, RTL)
- Leaflet maps (lazy-loaded), Cloudinary unsigned uploads
- Socket.IO client singleton, AuthContext + ChatContext

### Data Models
`User`, `CustomerProfile`, `WorkerProfile`, `WorkerServices`, `Category`, `ServiceRequest`, `Review`, `Report`, `PaymentMethod`, `WalletTransaction`, `Coupon`, `Conversation`, `LiveChat`, `Notification`, `Ticket`, `SearchLog`, `ProviderApplication`, `AdminProfile`, `Powers`.

---

## Prerequisites

- **Node.js** ≥ 20
- **npm** (or pnpm / yarn — pick one and stick with it)
- A **MongoDB** database (Atlas free tier works)
- A **Cloudinary** account (free tier) — for chat attachments and profile images
- A **Gmail** account with an [App Password](https://myaccount.google.com/apppasswords) — for sending verification emails

---

## Setup

### 0. You don't need to clone it or install it just hit this link :)

https://angezny.vercel.app/

You still insist on cloning? Then follow the steps below 

### 1. Clone

```bash
git clone https://github.com/abdomasry/Angezny-Web-Application.git
cd "Repo Fianl Project"
git submodule update --init --recursive   # front-end is a submodule
```

### 2. Backend

```bash
cd back-end
npm install
cp .env.example .env                # then fill in the values (see below)
npm run dev                          # nodemon → http://localhost:5000
```

**Required env vars** (in `back-end/.env`):

| Name | What it is |
|------|------------|
| `PORT` | API port (default `5000`) |
| `MONGODB_URI` | Mongo connection string |
| `JWT_SECRET` | Long random string used to sign auth tokens |
| `EMAIL_USER` | Gmail address used to send verification mail |
| `EMAIL_PASS` | Gmail **App Password** (not your account password) |
| `BASE_URL` | Frontend URL embedded in email links (e.g. `http://localhost:3000`) |

**One-time seed** — load the default Arabic categories:

```bash
node src/seed-categories.js
```

### 3. Frontend

In a second terminal:

```bash
cd front-end
npm install
cp .env.example .env.local           # then fill in the values
npm run dev                          # http://localhost:3000
```

**Required env vars** (in `front-end/.env.local`):

| Name | What it is |
|------|------------|
| `NEXT_PUBLIC_API_URL` | Backend base URL (e.g. `http://localhost:5000/api`) |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name |
| `NEXT_PUBLIC_CLOUDINARY_PRESET` | An **unsigned** upload preset name |

> All `NEXT_PUBLIC_*` vars are exposed to the browser — **never** put secrets there.

### 4. Open the app

- App: <http://localhost:3000>
- API: <http://localhost:5000/api>

Sign up as a customer, then sign up again (different email) as a worker to test both sides of the marketplace.

---

## Project Structure

```
back-end/                            Express API, Mongoose models, Socket.IO server
  src/
    config/                          DB + email transport
    Models/                          Mongoose schemas
    controllers/                     Request handlers
    routes/                          Express routers, mounted under /api
    middleware/                      auth / role guards / rate limit
    socket/                          chat.socket.js — real-time wiring
    scripts/                         One-off jobs (e.g. backfill-rank.js)
    index.js                         Entry point

front-end/                           Next.js 16 App Router (this folder is a git submodule)
  app/                               Routes — public, customer, worker, admin
  components/                        Shared UI (Navbar, MessageThread, ChatWidget, …)
  lib/                               auth-context, chat-context, api client, socket singleton
  public/                            Static assets

docs/PROJECT-SUMMARY.md              Full architecture & feature reference
design/                              Figma exports per area (auth, profiles, dashboards)
```

---

## Roles

- **customer** — browses workers, books services, chats, leaves reviews
- **worker** — manages services, accepts/rejects orders, tracks earnings
- **admin** — verifies workers, handles reports, manages support tickets
  (admin sub-roles via `Powers` model are planned but not yet wired up)

---

## Common Commands

### Backend
| Command | What it does |
|---------|--------------|
| `npm run dev` | Run with nodemon (auto-restart) |
| `npm start` | Run once (production-style) |

### Frontend
| Command | What it does |
|---------|--------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |

---

## Notes

- The front-end is a **git submodule**. After `git pull`, run `git submodule update --init --recursive` to sync it.
- The backend's `Models/` folder is capital-M. **This will break on Linux deployments** (case-sensitive filesystems) — rename to `models/` before deploying.
- Notifications auto-expire after 24h (Mongo TTL index); search logs after 30d.
