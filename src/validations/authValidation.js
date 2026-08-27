const Joi = require("joi");

const registerSchema = Joi.object({
  name: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const resetPasswordSchema = Joi.object({
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string().min(6).required(),
});

const changeInfoSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(2).max(100).required(),
  phone: Joi.string().max(20).optional().allow(null, ""),
  birthDate: Joi.string()
    .pattern(/^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}.*)$/)
    .optional()
    .allow(null, ""),
});

const getPermissionSchema = Joi.object({
  id: Joi.number().integer().required(),
});

const upSertPermissionSchema = Joi.object({
  userId: Joi.number().required(), 
  screenIds: Joi.array().items(Joi.string().required()).min(1).required(),
})


module.exports = {
  registerSchema,
  loginSchema,
  changeInfoSchema,
  resetPasswordSchema,
  getPermissionSchema,
  upSertPermissionSchema
};
