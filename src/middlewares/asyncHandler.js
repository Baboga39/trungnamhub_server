// src/middlewares/asyncHandler.js
/**
 * Wraps an async route handler/controller to automatically pass any thrown error to next(err).
 * Eliminates repetitive try-catch boilerplate in controllers.
 *
 * @param {Function} fn - async express handler (req, res, next)
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
