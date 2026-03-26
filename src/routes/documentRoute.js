const express = require("express");
const router = express.Router();
const multer = require("multer");
const middlewares = require("../middlewares");

const upload = multer({ storage: multer.memoryStorage() });

const controller = require("../controllers/documentController");
const {
  uploadDocumentSchema,
  sendApprovalSchema,
  handleApprovalSchema,
  handleApprovalByUserSchema,
} = require("../validations/documentValidation");

router.post(
  "/upload",
  middlewares.auth,
  upload.single("file"),
  middlewares.validation(uploadDocumentSchema),
  controller.uploadDocument,
);

router.post(
  "/send-approval",
  middlewares.auth,
  middlewares.validation(sendApprovalSchema),
  controller.sendApproval,
);

router.post(
  "/handle-approval-by-mail",
  middlewares.auth,
  middlewares.validation(handleApprovalSchema),
  controller.handleApprovalByMail,
);

router.post(
  "/handle-approval-by-user",
  middlewares.auth,
  middlewares.validation(handleApprovalByUserSchema),
  controller.handleApprovalByUser,
);

router.post("/resubmit", middlewares.auth, upload.single("file"), controller.resubmitDocument);

router.get("/getDocument/:id", controller.getDocumentDetail);

router.get("/getAllDocument", middlewares.auth, controller.getAllDocument);

module.exports = router;
