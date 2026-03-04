const Joi = require("joi");

const validStatuses = ["absent", "late", "excused", "unexcused"];

const memberRecordSchema = Joi.object({
  status: Joi.string()
    .valid(...validStatuses)
    .required()
    .messages({
      "any.only": `"status" must be one of [${validStatuses.join(", ")}]`,
      "any.required": `"status" is required`,
    }),
  note: Joi.string().allow("", null).max(500).messages({
    "string.max": `"note" must be under 500 characters`,
  }),
});

const dateRecordSchema = Joi.object().pattern(
  Joi.string()
    .pattern(/^\d+$/)
    .message("Member ID must be a number string"),
  memberRecordSchema
);

const attendanceMarkSchema = Joi.object({
  records: Joi.object()
    .pattern(
      Joi.string()
        .pattern(/^\d{4}-\d{2}-\d{2}$/)
        .message("Date key must be in format YYYY-MM-DD"),
      dateRecordSchema
    )
    .required()
    .messages({
      "object.base": `"records" must be an object with date keys`,
    }),
});

module.exports = { attendanceMarkSchema };
