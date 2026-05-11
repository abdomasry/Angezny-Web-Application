const jwt = require("jsonwebtoken");
const User = require("../models/User.Model");

// This middleware protects routes that require a logged-in user.
// It runs BEFORE the controller function.

const authMiddleware = async (req, res, next) => {
  try {

    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);


    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }


    if (user.status === "banned") {
      return res.status(403).json({ message: "تم حظر حسابك", banned: true });
    }
    if (user.status === "suspended") {
      return res.status(403).json({ message: "تم تعليق حسابك مؤقتاً", suspended: true });
    }

    req.user = user;


    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = authMiddleware;