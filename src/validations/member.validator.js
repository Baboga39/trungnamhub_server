const Joi = require("joi");

// schema validate member
const memberSchema = Joi.object({
  id: Joi.number().integer().optional(),

  name: Joi.string().min(2).max(100).required(),

  birthDate: Joi.string()
    .pattern(/^\d{1,2}\/\d{1,2}\/\d{4}$/) // dd/mm/yyyy
    .optional()
    .allow(null, '')
    .messages({
      "string.pattern.base": `"birthDate" must be in format dd/mm/yyyy`
    }),

  gender: Joi.string().valid("Nam", "Nữ", "Khác").optional().allow(null, ''),

  parish: Joi.string().max(100).optional().allow(null, ''),   // Xã đạo
  church: Joi.string().max(100).optional().allow(null, ''),   // Họ đạo

  startYear: Joi.number().integer().min(1900).max(new Date().getFullYear())
    .optional()
    .allow(null),

  fatherName: Joi.string().max(100).optional().allow(null, ''),
  motherName: Joi.string().max(100).optional().allow(null, ''),
  address: Joi.string().max(255).optional().allow(null, ''),
  contact: Joi.string().max(100).optional().allow(null, ''),

  active: Joi.boolean().optional().allow(null)
});



module.exports = { memberSchema };
