const jwt = require("jsonwebtoken");
const env = require("../config/env");

function sign(admin) {
  return jwt.sign({ id: String(admin._id), email: admin.email, role: admin.role }, env.jwtSecret, { expiresIn: "7d" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (_) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || "").replace("Bearer ", "");
  const user = token && verifyToken(token);
  if (!user) return res.status(401).json({ error: "Please log in." });
  req.user = user;
  next();
}

function requireWrite(req, res, next) {
  if (req.user.role === "viewer") return res.status(403).json({ error: "Viewers can't make changes." });
  next();
}

module.exports = { sign, verifyToken, requireAuth, requireWrite };
