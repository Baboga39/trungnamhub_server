const Joi = require("joi")


const uploadDocumentSchema = Joi.object({
  title: Joi.string()
    .min(3)
    .max(255)
    .required()
    .messages({
      "string.empty": `"title" is required`,
      "string.min": `"title" must be at least 3 characters`,
      "string.max": `"title" must not exceed 255 characters`,
    }),
  fileUrl: Joi.string().uri().required().messages({
    "string.empty": `"fileUrl" is required`,
    "string.uri": `"fileUrl" must be a valid URL`,
  }),
  publicId: Joi.string().required().messages({
    "string.empty": `"publicId" is required`,
  }),
})

// 🟢 2. Send Approval
const sendApprovalSchema = Joi.object({
  documentId: Joi.number()
    .integer()
    .required()
    .messages({
      "number.base": `"documentId" must be a number`,
      "any.required": `"documentId" is required`,
    }),

  reviewerIds: Joi.array()
    .items(Joi.number().integer())
    .min(1)
    .required()
    .messages({
      "array.base": `"reviewerIds" must be an array`,
      "array.min": `"reviewerIds must have at least 1 reviewer`,
      "any.required": `"reviewerIds is required`,
    }),
})

const handleApprovalSchema = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      "string.empty": `"token" is required`,
    }),

  action: Joi.string()
    .valid("APPROVE", "REJECT")
    .required()
    .messages({
      "any.only": `"action" must be APPROVE or REJECT`,
      "any.required": `"action" is required`,
    }),

  comment: Joi.string()
    .allow("", null)
    .max(1000)
    .messages({
      "string.max": `"comment" must not exceed 1000 characters`,
    }),
})

const handleApprovalByUserSchema = Joi.object({
  documentId: Joi.number()
    .integer()
    .required()
    .messages({
      "number.base": `"documentId" must be a number`,
      "any.required": `"documentId" is required`,
    }),

  action: Joi.string()
    .valid("APPROVE", "REJECT")
    .required()
    .messages({
      "any.only": `"action" must be APPROVE or REJECT`,
      "any.required": `"action" is required`,
    }),

  comment: Joi.string()
    .allow("", null)
    .max(1000)
    .messages({
      "string.max": `"comment" must not exceed 1000 characters`,
    }),
})

const resubmitDocumentSchema = Joi.object({
  documentId: Joi.number()
    .integer()
    .required()
    .messages({
      "number.base": `"documentId" must be a number`,
      "any.required": `"documentId" is required`,
    }),
  fileUrl: Joi.string().uri().required().messages({
    "string.empty": `"fileUrl" is required`,
    "string.uri": `"fileUrl" must be a valid URL`,
  }),
  publicId: Joi.string().required().messages({
    "string.empty": `"publicId" is required`,
  }),
  title: Joi.string()
    .min(3)
    .max(255)
})

const getDocumentDetailSchema = Joi.object({
  id: Joi.number()
    .integer()
    .required()
    .messages({
      "number.base": `"id" must be a number`,
      "any.required": `"id" is required`,
    }),
})

module.exports = {
  uploadDocumentSchema,
  sendApprovalSchema,
  handleApprovalSchema,
  resubmitDocumentSchema,
  getDocumentDetailSchema,
  handleApprovalByUserSchema,
}