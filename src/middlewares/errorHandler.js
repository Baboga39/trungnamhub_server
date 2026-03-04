function errorHandler(err, req, res, next) {
  console.error("❌ Error:", err);

  const statusCode = err.statusCode || 500;
  const message = err.message || "Something went wrong";

  return res.status(statusCode).json({
    statusCode,
    message,
    data: null,
    error: err.stack || null,
  });
}

module.exports = errorHandler;
