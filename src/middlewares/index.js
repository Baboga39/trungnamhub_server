const responseMiddleware = require("./response");
const errorHandler = require("./errorHandler");
const validation = require("./validate");
const auth = require("./authMiddleware");
const upload = require("./upload");
const { globalLimiter, authLimiter } = require("./rateLimiter");
const { corsOptions } = require("./corsConfig");
const asyncHandler = require("./asyncHandler");

module.exports = {
  responseMiddleware,
  errorHandler,
  validation,
  auth,
  upload,
  globalLimiter,
  authLimiter,
  corsOptions,
  asyncHandler,
};
