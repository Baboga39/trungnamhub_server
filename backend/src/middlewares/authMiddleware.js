// src/middlewares/authMiddleware.js
const authService = require("../services/authService");

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.error(401, "No token provided");
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.error(401, "Invalid token format. Use Bearer <token>");
  }

  try {
    const decoded = authService.verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.error(401, "Unauthorized");
  }
}

module.exports = authMiddleware;
