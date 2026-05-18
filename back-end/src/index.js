const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes");
const categoryRoutes = require("./routes/category.routes");
const workerRoutes = require("./routes/worker.routes");
const customerRoutes = require("./routes/customer.routes");
const customerSettingsRoutes = require("./routes/customer-settings.routes");
const workerDashboardRoutes = require("./routes/worker-dashboard.routes");
const adminRoutes = require("./routes/admin.routes");
const adminAnalyticsRoutes = require("./routes/admin.analytics.routes");
const searchRoutes = require("./routes/search.routes");
const couponRoutes = require("./routes/coupon.routes");
const chatRoutes = require("./routes/chat.routes");
const orderRoutes = require("./routes/order.routes");
const reviewRoutes = require("./routes/review.routes");
const favoritesRoutes = require("./routes/favorites.routes");
const customerPublicRoutes = require("./routes/customer-public.routes");
const supportRoutes = require("./routes/support.routes");
const providerApplicationRoutes = require("./routes/provider-application.routes");
const paymentRoutes = require("./routes/payment.routes");
const payoutRoutes = require("./routes/payout.routes");
const attachChatSocket = require("./socket/chat.socket");
const User = require("./models/User.Model");



connectDB();

// ============================================================
// AI assistant — cache the system AI user's _id once at startup.
// The chat-socket handler reads global.AI_USER_ID on every message to
// decide whether a conversation is human↔human or human↔AI. Doing the
// lookup once and stashing it on a global avoids hitting Mongo for every
// single chat:send.
//
// The seed (scripts/seed-ai-user.js) creates this user; we only LOOK it
// up here. If it isn't found, AI features stay dormant (the controller
// + socket handler gate on global.AI_USER_ID and silently behave like
// the old, AI-free chat).
// ============================================================
async function loadAiUserId() {
  const email = (process.env.AI_USER_EMAIL || "ai-assistant@system.local").toLowerCase();
  // Mongo connection may not be ready immediately after the dotenv tick.
  // A small retry (max ~10s) gives connectDB() time to finish without us
  // having to await it explicitly here.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const user = await User.findOne({ email, role: "ai" }).select("_id");
      if (user) {
        global.AI_USER_ID = String(user._id);
        console.log(`AI assistant user resolved: _id=${global.AI_USER_ID}`);
        return;
      }
      // Found nothing — no need to retry; the seed hasn't been run.
      console.warn(`AI assistant user NOT found (email=${email}). Run: node src/scripts/seed-ai-user.js`);
      return;
    } catch (err) {
      // Likely "Topology is closed" before Mongo finishes connecting. Wait + retry.
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.error("Failed to load AI user id after 10 attempts");
}
setImmediate(loadAiUserId);

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:3000",
  "https://angezny.vercel.app",
  "https://angezny-git-main-abdomasry2711-4527s-projects.vercel.app",
  "https://angezny-5u83v0ont-abdomasry2711-4527s-projects.vercel.app",
  "*",
  process.env.FRONTEND_URL,
].filter(Boolean);
const PORT = process.env.PORT ;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));


app.use(cors({
  origin: "*",
  credentials: true,
}));

app.get("/", (req, res) => {
    res.json({ message: "Server is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/workers", workerRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/customer", customerSettingsRoutes);
app.use("/api/worker", workerDashboardRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/chat", chatRoutes);
// Order endpoints live at /api/customer/orders and /api/worker/orders/:id/status.
// Mounted at /api so the router controls the full sub-paths itself.
app.use("/api", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/customers", customerPublicRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/provider-applications", providerApplicationRoutes);
// Paymob pay-in (customer → platform) and payout (platform → worker).
// Paymob's HMAC is computed over individual JSON fields (not the raw body),
// so the standard express.json() parser above is enough — no raw-body
// middleware needed.
app.use("/api/payments", paymentRoutes);
app.use("/api/worker/payouts", payoutRoutes);

// Create an explicit HTTP server so Socket.IO can attach to it.
// Using app.listen() directly would give Express its own server we can't share.
const server = http.createServer(app);

// Socket.IO needs its OWN cors block — Express's cors() middleware doesn't
// cover the WebSocket handshake. Missing this causes "xhr poll error" in the
// browser with no clear explanation.
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// Expose `io` to REST controllers via app.set('io', io). Controllers read it
// with req.app.get('io') to emit 'notification:new' events when creating
// Notification docs (e.g. order.controller.js). Keeps socket-aware logic out
// of the routing table itself.
app.set("io", io);

// Attach all chat-related socket handlers (auth, presence, message events).
// Kept in a separate module to keep this entrypoint clean.
attachChatSocket(io);

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
