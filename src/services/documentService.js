// src/services/documentService.js

const prisma = require("../libs/prisma");
const { uploadToCloudinary } = require("../libs/cloudinaryService");
const { createApprovalToken } = require("./approvalTokenService");

// ========================
// 🔥 DB ACCESS LAYER
// ========================

async function getDocumentByIdDB(id, tx = prisma) {
  return tx.document.findUnique({
    where: { id },
  });
}

async function createDocumentDB(data, tx = prisma) {
  return tx.document.create({ data });
}

async function updateDocumentDB(id, data, tx) {
  return tx.document.update({
    where: { id },
    data,
  });
}



async function deleteOldTokens(documentId, tx) {
  return tx.approvalToken.deleteMany({
    where: { documentId },
  });
}

async function createAuditLog(tx, data) {
  return tx.approval.create({ data });
}

async function getRejectedReviewers(documentId, version, tx) {
  const rejected = await tx.approval.findMany({
    where: {
      documentId,
      version,
      action: "REJECT",
    },
    select: {
      reviewerId: true,
    },
  });

  return rejected.map((r) => r.reviewerId);
}

// ========================
// 🔥 BUSINESS LOGIC
// ========================

function getNextVersion(doc) {
  return doc.version + 1;
}

function validateResubmit(doc) {
  if (!doc) throw new Error("Document not found");

  if (doc.status !== "NEED_REVISION") {
    throw new Error("Document is not in revision state");
  }
}

// ========================
// 🔥 MAIN SERVICES
// ========================

// 👉 Upload document mới
async function uploadDocument(file, data, user) {
  const uploaded = await uploadToCloudinary(file);

  return prisma.$transaction(async (tx) => {
    const document = await createDocumentDB(
      {
        title: data.title,
        fileUrl: uploaded.secure_url,
        createdById: user.userId,
        status: "PENDING",
        version: 1,
      },
      tx
    );
    return document;
  });
}

async function resubmitDocument(id, file, user) {
  const uploaded = await uploadToCloudinary(file);

  return prisma.$transaction(async (tx) => {
  
    const doc = await getDocumentByIdDB(Number(id), tx);
    validateResubmit(doc);

    const oldVersion = doc.version;

    // 2. lấy reviewer bị reject
    const rejectedReviewerIds = await getRejectedReviewers(
      id,
      oldVersion,
      tx
    );

    if (!rejectedReviewerIds.length) {
      throw new Error("No rejected reviewers found");
    }

    const newVersion = getNextVersion(doc);

    await deleteOldTokens(id, tx);

    await updateDocumentDB(
      id,
      {
        fileUrl: uploaded.secure_url,
        version: newVersion,
        status: "PENDING",
      },
      tx
    );

    console.log("Rejected reviewers:", rejectedReviewerIds);
await createApprovalToken(
  id,
  rejectedReviewerIds,
  tx
);

    await createAuditLog(tx, {
      documentId: id,
      reviewerId: user.userId,
      action: "RESUBMIT",
      version: newVersion,
      fileUrl: uploaded.secure_url,
    });

    return {
      success: true,
      version: newVersion,
      reviewers: rejectedReviewerIds,
    };
  });
}


// 👉 get detail
async function getDocumentById(id) {
  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      approvals: {
        orderBy: { createdAt: "desc" },
      },
      createdBy: true,
      approvedBy: true,
    },
  });

  if (!doc) throw new Error("Document not found");

  return doc;
}

// 👉 list
async function getDocuments(filter = {}) {
  return prisma.document.findMany({
    where: {
      ...(filter.status && { status: filter.status }),
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

// ========================
// 🔥 EXPORT
// ========================

module.exports = {
  uploadDocument,
  resubmitDocument,
  getDocumentById,
  getDocuments,
};