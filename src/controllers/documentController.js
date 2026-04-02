const services = require("../services")

// 🟢 1. Upload document (create hoặc version mới)
async function uploadDocument(req, res, next) {
  try {
    const data = req.body;
    const user = req.user;

    const document = await services.documentService.uploadDocument(data, user);

    res.ok(document, "Document created successfully");
  } catch (err) {
    next(err);
  }
}

async function sendApproval(req, res, next) {
  try {
    const { documentId, reviewerIds } = req.body
    console.log("Received send approval request:", { documentId, reviewerIds })

    if (!documentId || !reviewerIds?.length) {
      return res.status(400).json({
        message: "DocumentId and reviewerIds are required",
      })
    }

    const result = await services.approvalTokenService.createApprovalToken(
      documentId,
      reviewerIds,
      req.user
    )

    res.ok(result, "Approval sent successfully")
  } catch (err) {
    next(err)
  }
}

async function handleApprovalByMail(req, res, next) {
  try {
    const { token, action, comment } = req.body

    const result = await services.approvalTokenService.handleApproval(
      token,
      action,
      comment,
    )

    res.ok(result, "Action processed successfully")
  } catch (err) {
    next(err)
  }
}

async function handleApprovalByUser(req, res, next) {
  try {
    const { documentId, action, comment } = req.body
    const reviewerId = req.user.userId

    const result = await services.approvalTokenService.handleApprovalByUser({
      documentId,
      reviewerId,
      action,
      comment,
    })

    res.ok(result, "Action processed successfully")
  } catch (err) {
    next(err)
  }
}


async function resubmitDocument(req, res, next) {
  try {
    const { documentId, fileUrl, publicId , title} = req.body;
    const user = req.user;

    const document = await services.documentService.resubmitDocument(
      Number(documentId),
      { fileUrl, publicId, title },
      user
    );

    res.ok(document, "Document resubmitted successfully");
  } catch (err) {
    next(err);
  }
}

async function deleteDocument(req, res, next) {
  try {
    const { id } = req.params;
    const user = req.user;

    const result = await services.documentService.deleteDocument(id, user);

    res.ok(result, result.message || "Document deleted successfully");
  } catch (err) {
    next(err);
  }
}

async function getDocumentDetail(req, res, next) {
  try {
    const { id } = req.params

    const document = await services.documentService.getDocumentById(
      Number(id)
    )
    res.ok(document, "Document fetched successfully")
  } catch (err) {
    next(err)
  }
}

async function getAllDocument(req,res,next) {
  try {
    const documents = await services.documentService.getDocuments()
    res.ok(documents, "Documents fetched successfully")
  } catch (err) {
    next(err)
  }
}

async function getPendingApprovals(req, res, next) {
  try {
    const userId = req.user.userId;
    const result = await services.approvalTokenService.getPendingApprovals(userId);
    res.ok(result, "Fetched pending approvals successfully");
  } catch (err) {
    next(err);
  }
}

async function getApprovalDetail(req, res, next) {
  try {
    const { token } = req.params;
    const result = await services.approvalTokenService.getApprovalDetail(token);
    res.ok(result, "Fetched approval detail successfully");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadDocument,
  sendApproval,
  handleApprovalByMail,
  resubmitDocument,
  deleteDocument,
  getDocumentDetail,
  handleApprovalByUser,
  getAllDocument,
  getPendingApprovals,
  getApprovalDetail,
}