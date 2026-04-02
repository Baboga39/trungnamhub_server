// src/services/documentService.js

const prisma = require("../libs/prisma");
const { deleteFromCloudinary, extractPublicId } = require("../libs/cloudinaryService");
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
async function uploadDocument(data, user) {
  return await prisma.$transaction(async (tx) => {
    return await createDocumentDB(
      {
        title: data.title,
        fileUrl: data.fileUrl,
        createdById: user.userId,
        status: "PENDING",
        version: 1,
      },
      tx
    );
  });
}

async function resubmitDocument(id, data, user) {
  let oldFileUrl;

  const result = await prisma.$transaction(async (tx) => {
    const doc = await getDocumentByIdDB(Number(id), tx);
    validateResubmit(doc);

    oldFileUrl = doc.fileUrl;

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
        fileUrl: data.fileUrl,
        version: newVersion,
        status: "PENDING",
      },
      tx
    );

    await createApprovalToken(id, rejectedReviewerIds, tx);

    await createAuditLog(tx, {
      documentId: id,
      reviewerId: user.userId,
      action: "RESUBMIT",
      version: newVersion,
      fileUrl: data.fileUrl,
    });

    return {
      success: true,
      version: newVersion,
      reviewers: rejectedReviewerIds,
    };
  });

  // After DB is successfully updated, we delete the old file from Cloudinary 
  // so we don't hold onto dead versions.
  if (oldFileUrl) {
    const oldPublicId = extractPublicId(oldFileUrl);
    if (oldPublicId) {
      deleteFromCloudinary(oldPublicId).catch((err) =>
        console.error("Failed to delete old file from Cloudinary:", err)
      );
    }
  }

  return result;
}


// 👉 Xóa tài liệu
async function deleteDocument(id, user) {
  return await prisma.$transaction(async (tx) => {
    const doc = await getDocumentByIdDB(Number(id), tx);
    if (!doc) {
      throw new Error("Document not found");
    }

    if (doc.createdById !== user.userId) {
      throw new Error("Bạn không có quyền xóa tài liệu của người khác");
    }

    await deleteOldTokens(Number(id), tx);
    await tx.approval.deleteMany({
      where: { documentId: Number(id) }
    });

    // Xóa document chính
    await tx.document.delete({
      where: { id: Number(id) }
    });

    // Dọn rác Cloudinary
    if (doc.fileUrl) {
      const publicId = extractPublicId(doc.fileUrl);
      if (publicId) {
        deleteFromCloudinary(publicId).catch((err) =>
          console.error("Failed to delete file from Cloudinary after document deletion:", err)
        );
      }
    }

    return { success: true, message: "Xóa tài liệu thành công" };
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
    include: {
      createdBy: {
        select: {
          name: true,
          email: true,
        }
      }
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
  deleteDocument,
  getDocumentById,
  getDocuments,
};