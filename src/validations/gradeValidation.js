const Joi = require("joi");

// 🎯 Schema cho Grade Category (không đổi)
const gradeCategorySchema = Joi.object({
  id: Joi.number().integer().optional(),

  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      "string.empty": `"name" is required`,
      "string.min": `"name" must have at least 2 characters`,
      "string.max": `"name" must not exceed 100 characters`
    }),

  weight: Joi.number()
    .required()
    .messages({
      "number.base": `"weight" must be a number`,
      "number.min": `"weight" must be greater or equal to 0`,
      "number.max": `"weight" must not exceed 1`
    }),

  active: Joi.boolean().optional().allow(null),
  createdAt: Joi.date().optional()
});

// 🎓 Schema validate cho từng Grade (điểm)
const gradeSchema = Joi.object({
  id: Joi.number().integer().optional(),

  score: Joi.number()
    .min(0)
    .max(10)
    .required()
    .messages({
      "number.base": `"score" must be a number`,
      "number.min": `"score" must be >= 0`,
      "number.max": `"score" must be <= 10`
    }),

  memberId: Joi.number()
    .integer()
    .required()
    .messages({
      "number.base": `"memberId" must be a number`,
      "any.required": `"memberId" is required`
    }),

  categoryId: Joi.number()
    .integer()
    .required()
    .messages({
      "number.base": `"categoryId" must be a number`,
      "any.required": `"categoryId" is required`
    }),

  createdAt: Joi.date().optional()
});

// 📚 Schema validate cho mảng Grades (khi import nhiều bản ghi)
const gradesArraySchema = Joi.array()
  .items(gradeSchema)
  .min(1)
  .messages({
    "array.min": `"grades" must contain at least one grade record`
  });

// 💡 Schema mới — dùng riêng cho API upSertScore (memberId + scores[])
const scoreItemSchema = Joi.object({
  categoryId: Joi.number()
    .integer()
    .required()
    .messages({
      "number.base": `"categoryId" must be a number`,
      "any.required": `"categoryId" is required`
    }),
  score: Joi.number()
    .min(0)
    .max(10)
    .required()
    .messages({
      "number.base": `"score" must be a number`,
      "number.min": `"score" must be >= 0`,
      "number.max": `"score" must be <= 10`
    })
});

const upsertGradeSchema = Joi.object({
  memberId: Joi.number()
    .integer()
    .required()
    .messages({
      "number.base": `"memberId" must be a number`,
      "any.required": `"memberId" is required`
    }),
  scores: Joi.array()
    .items(scoreItemSchema)
    .min(1)
    .required()
    .messages({
      "array.base": `"scores" must be an array`,
      "array.min": `"scores" must contain at least one item`,
      "any.required": `"scores" is required`
    })
});

module.exports = {
  gradeSchema,
  gradeCategorySchema,
  gradesArraySchema,
  upsertGradeSchema
};
