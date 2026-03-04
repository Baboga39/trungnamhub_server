const Joi = require("joi");

const userUpsertSchema = Joi.object({
  id: Joi.number().integer().positive().optional(),

  name: Joi.string().min(2).max(100).required().messages({
    "any.required": "Tên người dùng là bắt buộc",
    "string.empty": "Tên người dùng không được để trống",
  }),

  email: Joi.string().email().required().messages({
    "string.email": "Email không hợp lệ",
    "any.required": "Email là bắt buộc",
  }),

  password: Joi.string().min(6).max(100).required().messages({
    "string.min": "Mật khẩu tối thiểu 6 ký tự",
    "any.required": "Mật khẩu là bắt buộc",
  }),

  startYear: Joi.string()
    .pattern(/^\d{2}\/\d{2}\/\d{4}$/)
    .message("startYear must be in dd/MM/yyyy format")
    .required(),
  sumEvent: Joi.number().integer().min(0).optional(),
  role: Joi.string().default("user"),
});

const deleteUserSchema = Joi.object({
   id: Joi.number().integer().positive().required().messages({
    "any.required": "ID người dùng là bắt buộc",
  }),
});

module.exports = { userUpsertSchema,deleteUserSchema };
