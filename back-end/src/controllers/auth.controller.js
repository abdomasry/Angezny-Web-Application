const User = require("../models/User.Model");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../config/email");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const signup = async (req, res) => {
  try {
    const { firstName, lastName, email, password, confirmPassword, phone, role } =
      req.body;

    if (!firstName || !lastName || !(email || phone) || !password) {
      return res.status(400).json({
        message: "Please provide all required fields",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        message: "Passwords do not match",
      });
    }

    if (email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({
          message: "Email already in use",
        });
      }
    }

    if (phone) {
      const phoneExists = await User.findOne({ phone });
      if (phoneExists) {
        return res.status(400).json({
          message: "Phone number already in use",
        });
      }
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hasEmail = !!email;

    const userData = {
      firstName,
      lastName,
      ...(email && { email }),
      ...(phone && { phone }),
      password,
      // Allow choosing role at signup (customer or worker). Admin can only be set by another admin.
      ...(role && role !== 'admin' && { role }),
      verificationCode: hasEmail ? verificationCode : null,
      verificationCodeExpires: hasEmail ? Date.now() + 10 * 60 * 1000 : null,
      isVerified: !hasEmail, // Phone-only users are immediately verified
    };
    const user = await User.create(userData);

    if (email) {
      sendVerificationEmail(email, verificationCode).catch(err => {
        console.log("Email sending failed:", err.message);
      });
    }

    const token = generateToken(user._id);

    res.status(201).json({
      message: hasEmail
        ? "تم انشاء الحساب بنجاح. يرجى التحقق من بريدك الإلكتروني لتفعيل حسابك."
        : "تم إنشاء الحساب بنجاح",
      token,
      user: user.toPublicJSON(),
      requireVerification: hasEmail,
    });
  } catch (error) {
    console.log("ERROR NAME:", error.name);
    console.log("ERROR MESSAGE:", error.message);
    console.log("FULL ERROR:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages[0] });
    }

    res.status(500).json({ message: "Server error, please try again" });
  }
};

const signin = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if (!(email || phone) || !password) {
      return res.status(400).json({
        message: "Please provide email/phone and password",
      });
    }

    const user = await User.findOne({
      ...(email && { email }),
      ...(phone && { phone }),
    });
    if (!user) {
      return res.status(400).json({
        message: "Invalid email/phone",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password",
      });
    }

    // Check if account is banned or suspended BEFORE issuing a token.
    // This is the enforcement — without this, banned users could still log in.
    if (user.status === "banned") {
      return res.status(403).json({
        message: "تم حظر حسابك. يرجى التواصل مع الدعم الفني.",
        banned: true,
      });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        message: "تم تعليق حسابك مؤقتاً. يرجى التواصل مع الدعم الفني.",
        suspended: true,
      });
    }

    const token = generateToken(user._id);
    res.json({
      message: "Login successful",
      token,
      user: user.toPublicJSON(),
    });
  } catch (error) {
    console.log("ERROR NAME:", error.name);
    console.log("ERROR MESSAGE:", error.message);
    console.log("FULL ERROR:", error);
    res.status(500).json({ message: "Server error, please try again" });
  }
};

// ============================================================
// POST /api/auth/forgot-password
// ============================================================
// Body: { email? } | { phone? }
// Generates a 1-hour reset JWT, stashes it on the user, and emails the link.
const forgotPassword = async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!(email || phone)) {
      return res.status(400).json({
        message: "يرجى إدخال البريد الإلكتروني أو رقم الهاتف",
      });
    }

    const user = await User.findOne({
      ...(email && { email }),
      ...(phone && { phone }),
    });

    // The "always 200" pattern — only do real work when the account exists,
    if (user) {
      const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      user.resetPasswordToken = resetToken;
      user.resetPasswordTokenExpires = Date.now() + 3600000;
      await user.save();

      if (user.email) {
        // Send via email. await so a transport error surfaces in our logs.
        try {
          await sendPasswordResetEmail(user.email, resetToken);
        } catch (mailErr) {
          console.error("sendPasswordResetEmail failed:", mailErr);
          // Still 200 OK to the client — the user can retry. We don't want
          // to expose mail-transport hiccups to attackers either.
        }
      }
      // Phone-only users currently get no SMS. When we wire SMS, branch here.
    }

    res.json({
      message: "إذا كان الحساب موجوداً، فقد أرسلنا تعليمات إعادة التعيين.",
    });
  } catch (error) {
    console.log("ERROR NAME:", error.name);
    console.log("ERROR MESSAGE:", error.message);
    console.log("FULL ERROR:", error);
    res.status(500).json({ message: "Server error, please try again" });
  }
};

// ============================================================
// POST /api/auth/reset-password
// ============================================================
// Body: { token, password, confirmPassword }
// Verifies the JWT and matches it against the user's stored
// resetPasswordToken Hashes
// the new password and clears the reset state.
const resetPassword = async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body || {};

    if (!token) {
      return res.status(400).json({ message: "رابط الاستعادة غير صالح" });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({
        message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
      });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "كلمتا المرور غير متطابقتين" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({
        message: "رابط الاستعادة منتهي الصلاحية أو غير صالح",
      });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(400).json({
        message: "رابط الاستعادة غير صالح",
      });
    }
    // Match the JWT against the stored copy so a token revoked by a newer
    // forgot-password request can't be re-used.
    if (
      !user.resetPasswordToken ||
      user.resetPasswordToken !== token ||
      !user.resetPasswordTokenExpires ||
      user.resetPasswordTokenExpires < Date.now()
    ) {
      return res.status(400).json({
        message: "رابط الاستعادة منتهي الصلاحية. يرجى طلب رابط جديد.",
      });
    }

    // Assign the plaintext — the User model's pre('save') hook hashes it.
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpires = undefined;
    await user.save();

    res.json({ message: "تم تحديث كلمة المرور بنجاح" });
  } catch (error) {
    console.error("resetPassword error:", error);
    res.status(500).json({ message: "Server error, please try again" });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { code } = req.body
    const token = req.headers.authorization?.split(" ")[1]

    if (!token) {
      return res.status(401).json({ message: "No token provided" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ message: "المسخدم غير موجود" })
    }

    if (user.verificationCode !== code) {
      return res.status(400).json({ message: "الكود غير صحيح" })
    }

    if (user.verificationCodeExpires < Date.now()) {
      return res.status(400).json({ message: "الكود غير صحيح او منتهي الصلاحية" })
    }

    user.isVerified = true
    user.verificationCode = null
    user.verificationCodeExpires = null
    await user.save()

    res.json({ message: "تم التحقق من البريد الإلكتروني بنجاح" })

  } catch (error) {
    res.status(500).json({ message: "حدث خطأ في الخادم، يرجى المحاولة لاحقًا" })
  }
}

const resendVerificationCode = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ message: "المسخدم غير موجود" })
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "المسخدم متحقق بالفعل" })
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()
    user.verificationCode = verificationCode
    user.verificationCodeExpires = Date.now() + 10 * 60 * 1000
    await user.save()

    if (user.email) {
      try {
        await sendVerificationEmail(user.email, verificationCode)
      } catch (emailError) {
        console.log("Email sending failed:", emailError.message)
      }
    }

    res.json({ message: "تم إرسال كود التحقق الجديد إلى بريدك الإلكتروني" })

  } catch (error) {
    res.status(500).json({ message: "حدث خطأ في الخادم، يرجى المحاولة لاحقًا" })
  }
}

// getMe - Returns the currently logged-in user's data.
// The authMiddleware already verified the token and attached the user to req.user,
const getMe = async (req, res) => {
  try {
    res.json({ user: req.user.toPublicJSON() });
  } catch (error) {
    res.status(500).json({ message: "Server error, please try again" });
  }
};

// ============================================================
// GET /api/auth/notifications
// ============================================================
// Returns the logged-in user's notifications (newest first).
const Notification = require("../models/Notification");

const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });

    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: "Server error fetching notifications" });
  }
};

// PUT /api/auth/notifications/read-all — mark all as read
const markNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Server error updating notifications" });
  }
};

// ============================================================
// OAUTH — Google + Facebook
// ============================================================
// Banned/suspended accounts get the same 403 they'd get from /signin.
const handleOAuthLogin = async ({ res, providerName, providerId, email, firstName, lastName, profileImage }) => {
  if (!providerId) {
    return res.status(400).json({ message: "Provider returned no user id" });
  }

  // Step 1: try by provider id (returning OAuth user — fast path)
  const providerField = providerName === "google" ? "googleId" : "facebookId";
  let user = await User.findOne({ [providerField]: providerId });

  // Step 2: if not found and we have an email, try auto-linking
  if (!user && email) {
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      // Existing local account → attach the providerId so future OAuth sign-ins
      user[providerField] = providerId;
      if (!user.profileImage && profileImage) user.profileImage = profileImage;
      await user.save();
    }
  }

  // Step 3: brand new user → create one
  if (!user) {
    user = await User.create({
      firstName: firstName || "User",
      lastName: lastName || "",
      ...(email && { email: email.toLowerCase() }),
      // No password — model's `required` function returns false when provider
      // is not "local".
      provider: providerName,
      [providerField]: providerId,
      profileImage,
      // OAuth providers already verified the email
      isVerified: !!email,
    });
  }

  // Step 4: same banned/suspended gates as /signin
  if (user.status === "banned") {
    return res.status(403).json({
      message: "تم حظر حسابك. يرجى التواصل مع الدعم الفني.",
      banned: true,
    });
  }
  if (user.status === "suspended") {
    return res.status(403).json({
      message: "تم تعليق حسابك مؤقتاً. يرجى التواصل مع الدعم الفني.",
      suspended: true,
    });
  }

  const token = generateToken(user._id);
  return res.json({
    message: "Login successful",
    token,
    user: user.toPublicJSON(),
  });
};

// POST /api/auth/google
// Body: { idToken } OR { accessToken }
//
// The frontend can send EITHER:
const googleSignin = async (req, res) => {
  try {
    const { idToken, accessToken } = req.body;
    if (!idToken && !accessToken) {
      return res.status(400).json({ message: "Missing idToken or accessToken" });
    }

    let payload; // { sub, email, given_name, family_name, picture, email_verified }

    if (idToken) {
      if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(500).json({
          message: "Google sign-in is not configured on the server",
        });
      }
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else {
      // Verify the access token by calling Google's userinfo. A bad token
      // returns 401 with no body; a good one returns the profile.
      const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) {
        return res.status(401).json({ message: "Google access token is invalid" });
      }
      payload = await resp.json();
      // Normalize to the same shape as verifyIdToken's payload.
      // userinfo returns: { sub, name, given_name, family_name, picture,
      //                     email, email_verified, locale }
    }

    if (!payload?.email_verified) {
      return res.status(400).json({
        message: "Google account email is not verified",
      });
    }

    return await handleOAuthLogin({
      res,
      providerName: "google",
      providerId: payload.sub,
      email: payload.email,
      firstName: payload.given_name,
      lastName: payload.family_name,
      profileImage: payload.picture,
    });
  } catch (error) {
    console.error("googleSignin error:", error?.message || error);
    return res.status(401).json({
      message: "تعذّر التحقق من حساب Google. حاول مرة أخرى.",
    });
  }
};

// POST /api/auth/facebook  { accessToken }
const facebookSignin = async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ message: "Missing accessToken" });
    }

    // We ask Graph for: id (the FB user's stable id), name parts, email,
    // and the picture URL. `email` is the only field that may be missing
    const fields = "id,first_name,last_name,email,picture.type(large)";
    const url = `https://graph.facebook.com/me?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok || !data?.id) {
      return res.status(401).json({
        message: data?.error?.message || "Facebook token verification failed",
      });
    }

    return await handleOAuthLogin({
      res,
      providerName: "facebook",
      providerId: data.id,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      profileImage: data.picture?.data?.url,
    });
  } catch (error) {
    console.error("facebookSignin error:", error?.message || error);
    return res.status(401).json({
      message: "تعذّر التحقق من حساب Facebook. حاول مرة أخرى.",
    });
  }
};

module.exports = { signup, signin, forgotPassword, resetPassword, verifyEmail, resendVerificationCode, getMe, getNotifications, markNotificationsRead, googleSignin, facebookSignin }
