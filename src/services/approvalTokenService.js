// src/services/approvalTokenService.js

const prisma = require("../libs/prisma");
const crypto = require("crypto");
const { sendApprovalMail } = require("./mailService/mailService");


function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}


async function getDocumentById(id, tx = prisma) {
  return tx.document.findUnique({ where: { id } });
}

async function getTokenByToken(token, tx = prisma) {
  return tx.approvalToken.findUnique({ where: { token } });
}

async function getTokenByReviewer(documentId, reviewerId, version, tx = prisma) {
  return tx.approvalToken.findFirst({
    where: { documentId, reviewerId, version },
  });
}

async function createApprovalHistory(data, tx) {
  return tx.approval.create({ data });
}

async function updateTokenStatus(id, status, tx) {
  return tx.approvalToken.update({
    where: { id },
    data: { status },
  });
}

async function updateDocumentStatus(id, data, tx) {
  return tx.document.update({
    where: { id },
    data,
  });
}

async function countTotalApprovers(documentId, version, tx) {
  return tx.approvalToken.count({
    where: { documentId, version },
  });
}

async function countApproved(documentId, version, tx) {
  return tx.approval.count({
    where: {
      documentId,
      version,
      action: "APPROVE",
    },
  });
}

function validateToken(tokenData, action) {
  if (!tokenData) throw new Error("Invalid token");

  if (tokenData.status === "APPROVED") {
    throw new Error("Already approved - cannot change");
  }

  if (tokenData.status === "REJECTED" && action === "REJECT") {
    throw new Error("Already rejected");
  }

  if (tokenData.expiredAt && tokenData.expiredAt < new Date()) {
    throw new Error("Token expired");
  }
}

function validateDocument(document) {
  if (!document) throw new Error("Document not found");

  if (document.status === "APPROVED") {
    throw new Error("Document already finalized");
  }
}

function validateVersion(tokenData, document) {
  if (tokenData.version !== document.version) {
    throw new Error("Token outdated");
  }
}


async function handleApprovalCore({ tx, document, tokenData, action, comment }) {
  await createApprovalHistory(
    {
      documentId: document.id,
      reviewerId: tokenData.reviewerId,
      action,
      comment,
      version: document.version,
      fileUrl: document.fileUrl,
    },
    tx
  );

  await updateTokenStatus(
    tokenData.id,
    action === "APPROVE" ? "APPROVED" : "REJECTED",
    tx
  );

  if (action === "REJECT") {
    await updateDocumentStatus(
      document.id,
      { status: "NEED_REVISION" },
      tx
    );

    return { success: true, status: "NEED_REVISION" };
  }

  const [total, approved] = await Promise.all([
    countTotalApprovers(document.id, document.version, tx),
    countApproved(document.id, document.version, tx),
  ]);

  if (approved === total) {
    await updateDocumentStatus(
      document.id,
      {
        status: "APPROVED",
        approvedById: tokenData.reviewerId,
      },
      tx
    );

    return { success: true, status: "APPROVED" };
  }

  return { success: true, status: "PENDING" };
}


async function handleApproval(token, action, comment) {
  return prisma.$transaction(async (tx) => {
    const tokenData = await getTokenByToken(token, tx);
    validateToken(tokenData, action);

    const document = await getDocumentById(tokenData.documentId, tx);
    validateDocument(document);
    validateVersion(tokenData, document);

    return handleApprovalCore({
      tx,
      document,
      tokenData,
      action,
      comment,
    });
  });
}


async function handleApprovalByUser({
  documentId,
  reviewerId,
  action,
  comment,
}) {
  return prisma.$transaction(async (tx) => {
    const document = await getDocumentById(documentId, tx);
    validateDocument(document);

    const tokenData = await getTokenByReviewer(
      documentId,
      reviewerId,
      document.version,
      tx
    );

    if (!tokenData) {
      throw new Error("You are not assigned to approve this document");
    }

    validateToken(tokenData, action);

    return handleApprovalCore({
      tx,
      document,
      tokenData,
      action,
      comment,
    });
  });
}


async function createApprovalToken(documentId, reviewerIds, senderUser, tx = prisma) {
  if (!reviewerIds?.length) {
    throw new Error("No reviewers provided");
  }

  const document = await getDocumentById(documentId, tx);
  if (!document) throw new Error("Document not found");

  const tokens = reviewerIds.map((reviewerId) => ({
    token: generateToken(),
    documentId,
    reviewerId,
    version: document.version,
    expiredAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  }));

  const result = await tx.approvalToken.createMany({ data: tokens });

  const links = tokens.map((t) => ({
    reviewerId: t.reviewerId,
    link: `${process.env.FRONTEND_URL}/approve?token=${t.token}`,
  }));

  const reviewers = await tx.user.findMany({
    where: { id: { in: reviewerIds } },
    select: { id: true, name: true, email: true },
  });

  console.log("Generated approval links:", links);

  for (const { reviewerId, link } of links) {
    const reviewer = reviewers.find((r) => r.id === reviewerId);
    if (reviewer) {
      sendApprovalMail({
        documentTitle: document.title,
        reviewerName: reviewer.name,
        senderName: senderUser?.name || "Hệ thống",
        approvalLink: link,
      }).catch((err) => console.error("Lỗi khi gửi email:", err));
    }
  }

  return {
    count: result.count,
    links,
  };
}


async function getApprovalDetail(token) {
  const tokenData = await prisma.approvalToken.findUnique({
    where: { token },
    include: { document: true },
  });

  if (!tokenData) throw new Error("Invalid token");

  if (tokenData.expiredAt < new Date()) {
    throw new Error("Token expired");
  }

  return tokenData;
}

async function getApprovalStatus(documentId) {
  const doc = await getDocumentById(documentId);

  const tokens = await prisma.approvalToken.findMany({
    where: {
      documentId,
      version: doc.version,
    },
    include: { reviewer: true },
  });

  return tokens.map((t) => ({
    reviewerId: t.reviewerId,
    reviewerName: t.reviewer.name,
    status: t.status,
  }));
}


async function getPendingApprovals(reviewerId) {
  return prisma.approvalToken.findMany({
    where: {
      reviewerId: Number(reviewerId),
      status: "PENDING",
      document: {
        status: "PENDING", 
      }
    },
    include: {
      document: {
        include: { 
          createdBy: { select: { name: true, email: true } }
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

module.exports = {
  createApprovalToken,
  handleApproval,
  handleApprovalByUser,
  getApprovalDetail,
  getApprovalStatus,
  getPendingApprovals,
};