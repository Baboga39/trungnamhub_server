function validate(schema, source = "body") {
  return (req, res, next) => {
    let data;

    if (source === "body") data = req.body ?? {};
    else if (source === "params")
      data = { ...req.params }; 
    else if (source === "query") data = { ...req.query };
    else data = {};


    const { error, value } = schema.validate(data, { abortEarly: false });

    if (error) {
      console.error("❌ Validation error:", error.details);

      const details = error.details.map((d) => d.message.replace(/['"]+/g, ""));

      return res.badRequest(details, "Validation failed");
    }

    if (source === "body") req.body = value;
    else if (source === "params") req.params = value;
    else if (source === "query") req.query = value;

    next();
  };
}

module.exports = validate;
