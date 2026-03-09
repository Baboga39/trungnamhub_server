const Joi = require("joi");

const activitySchema = Joi.object({
  id: Joi.number().integer().positive().optional(),

  name: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .required()
    .messages({
      "string.empty": `"name" cannot be empty`,
      "string.min": `"name" must be at least 3 characters`,
      "string.max": `"name" must be under 200 characters`,
      "any.required": `"name" is required`,
    }),

  description: Joi.string()
    .allow("", null)
    .max(1000)
    .messages({
      "string.max": `"description" must be under 1000 characters`,
    }),

  date: Joi.date()
    .required()
    .messages({
      "date.base": `"date" must be a valid date`,
      "any.required": `"date" is required`,
    }),
});

module.exports = { activitySchema };