function responseMiddleware(req, res, next) {
  res.ok = (data = null, message = "Success") => {
    return res.status(200).json({
      statusCode: 200,
      message,
      data,
      error: null,
    });
  };

   res.badRequest = (errors, message = "Validation failed") => {
    return res.status(400).json({
      statusCode: 400,
      message,
      data: null,
      errors,
    });
  };

  res.notFound = (data = null, message = "Not Found") => {
    return res.status(404).json({
      statusCode: 404,
      message,
      data,
      error: null,
    });
  }

  res.error = (statusCode = 500, message = "Internal Server Error", error = null) => {
    return res.status(statusCode).json({
      statusCode,
      message,
      data: null,
      error,
    });
  };



  next();
}

module.exports = responseMiddleware;
