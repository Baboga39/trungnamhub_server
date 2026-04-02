const express = require("express");
const router = express.Router();
const middlewares = require("../middlewares");

const controller = require("../controllers/documentController");
const {
  uploadDocumentSchema,
  sendApprovalSchema,
  handleApprovalSchema,
  handleApprovalByUserSchema,
  resubmitDocumentSchema,
} = require("../validations/documentValidation");

router.post(
  "/create",
  middlewares.auth,
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

router.post(
  "/resubmit",
  middlewares.auth,
  middlewares.validation(resubmitDocumentSchema),
  controller.resubmitDocument
);

router.get("/getDocument/:id", controller.getDocumentDetail);

router.get("/getAllDocument", middlewares.auth, controller.getAllDocument);

router.get("/pending-approvals", middlewares.auth, controller.getPendingApprovals);

router.get("/approve-detail/:token", middlewares.auth, controller.getApprovalDetail);

router.delete("/delete/:id", middlewares.auth, controller.deleteDocument);

module.exports = router;
