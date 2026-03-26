const services = require("../services")

// 🟢 1. Upload document (create hoặc version mới)
async function uploadDocument(req, res, next) {
  try {
    const file = req.file
    const data = req.body
    const user = req.user

    if (!file) {
      return res.status(400).json({
        message: "File is required",
      })
    }

    const document = await services.documentService.uploadDocument(
      file,
      data,
      user
    )

    res.ok(document, "Document uploaded successfully")
  } catch (err) {
    next(err)
  }
}

// 🟢 2. Gửi approval (multi reviewer)
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
      reviewerIds
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
    const file = req.file
    const { documentId } = req.body
    const user = req.user

    

    const document = await services.documentService.resubmitDocument(
      Number(documentId),
      file,
      user
    )

    res.ok(document, "Document resubmitted successfully")
  } catch (err) {
    next(err)
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

module.exports = {
  uploadDocument,
  sendApproval,
  handleApprovalByMail,
  resubmitDocument,
  getDocumentDetail,
  handleApprovalByUser,
  getAllDocument,
}