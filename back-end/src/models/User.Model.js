const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      minlength: [3, "First name must be at least 3 characters long"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      minlength: [3, "Last name must be at least 3 characters long"],
    },
    email: {
      type: String,
      lowercase: true,
      sparse: true,
      unique: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      // Password is required ONLY for local sign-ups. OAuth users (Google,
      // Facebook)
      required: [
        function () { return this.provider === "local" || !this.provider; },
        "Password is required",
      ],
      minlength: [6, "Password must be at least 6 characters long"],
    },
    // ─── OAuth / social-login fields ──────────────────────────────
    provider: {
      type: String,
      enum: ["local", "google", "facebook"],
      default: "local",
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, // sparse so multiple users with no googleId don't collide
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordTokenExpires: {
      type: Date,
      default: null,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      match: [
        /^(01[0125][0-9]{8}|\+20\d{10})$/,
        "Please enter a valid phone number",
      ],
    },
    role: {
      type: String,
      // "ai" is a reserved system role for the single AI-assistant user
      // (see scripts/seed-ai-user.js). Cannot be assigned via signup —
      // only the seed script creates it.
      enum: ["customer", "worker", "admin", "ai"],
      default: "customer",
    },
    profileImage: String,
    bio: String,
    location: {
      governorate: String,
      city: String,
      area: String,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationCode: {
      type: String,
      default: null,
    },

    verificationCodeExpires: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active",
    },
    // ============================================================
    // Notification Preferences
    // ============================================================
    notificationPreferences: {
      orders: { type: Boolean, default: true },       // Order status updates
      messages: { type: Boolean, default: true },     // Chat messages from workers
      promotions: { type: Boolean, default: true },   // Deals, offers, marketing
    },

    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // ─── Customer rating aggregates ──────────────────────────────
    // Populated by the worker→customer review flow. NOT exposed via
    // toPublicJSON() — the customer must not see their own rating.
    // Returned only when a worker or admin queries /api/customers/:id.
    customerRatingAverage: { type: Number, default: 0 },
    customerTotalReviews: { type: Number, default: 0 },
  },
  { timestamps: true },
);

userSchema.pre("save", async function () {
  // Skip hashing when the password didn't change OR when this is an OAuth
  // user with no password at all. `bcrypt.hash(undefined, 10)` would throw.
  if (!this.isModified("password") || !this.password) {
    return;
  }
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    firstName: this.firstName,
    lastName: this.lastName,
    ...(this.email && { email: this.email }),
    ...(this.phone && { phone: this.phone }),
    ...(this.profileImage && { profileImage: this.profileImage }),
    role: this.role,
    isVerified: this.isVerified,
    notificationPreferences: this.notificationPreferences,
  };
};

userSchema.methods.isResetTokenValid = function () {
  return (
    this.resetPasswordTokenExpires > Date.now() &&
    this.resetPasswordToken !== null
  );
};

module.exports = mongoose.model("User", userSchema);
