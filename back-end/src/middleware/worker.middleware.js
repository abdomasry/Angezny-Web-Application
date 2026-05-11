// workerOnly middleware — runs AFTER authMiddleware

const workerOnly = (req, res, next) => {
  // req.user is guaranteed to exist here because authMiddleware ran first
  // and would have returned 401 if the token was invalid
  if (req.user.role !== "worker") {
    return res.status(403).json({ message: "Worker access required" });
  }

  // User is a worker — let the request continue to the controller
  next();
};

module.exports = workerOnly;
