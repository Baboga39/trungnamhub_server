const { parseDate } = require("../libs/parseDate");
const prisma = require("../libs/prisma");

function normalizeBranch(branch) {
  return branch?.trim().normalize("NFC");
}
function getMemberStatus(member) {
  if (member.promotionDate) return "PROMOTED";
  if (member.active) return "ACTIVE";
  return "INACTIVE";
}

function mapMemberStatus(member) {
  return {
    ...member,
    status: getMemberStatus(member),
  };
}
function buildBranchFilter(user) {
  const role = String(user?.role || "").toLowerCase();
  const branchStr = String(user?.branch || "").toLowerCase();
  if (role === "admin" || branchStr === "admin") return {};

  const branch = normalizeBranch(user?.branch);

  if (branch) return { branch };

  throw { statusCode: 403, message: "User does not have a branch assigned" };
}
async function saveStatusHistory(tx, oldMember, newMember, note = null) {
  const oldPromotion = oldMember?.promotionDate?.getTime() ?? null;
  const newPromotion = newMember.promotionDate?.getTime() ?? null;

  const changed =
    !oldMember ||
    oldMember.active !== newMember.active ||
    oldPromotion !== newPromotion;

  if (!changed) return;

  const type = getMemberStatus(newMember);

  let historyNote = note;

  if (!historyNote) {
    switch (type) {
      case "PROMOTED":
        historyNote = "Promoted";
        break;
      case "ACTIVE":
        historyNote = "Activated";
        break;
      case "INACTIVE":
        historyNote = "Deactivated";
        break;
    }
  }

  await tx.memberStatusHistory.create({
    data: {
      memberId: newMember.id,
      status: newMember.active,
      type,
      date: newMember.promotionDate ?? new Date(),
      note: historyNote,
    },
  });
}
async function upsertMember(data, user) {
  const { id, ...rest } = data;

  const memberData = {
    ...rest,
    birthDate: parseDate(rest.birthDate),
    startDate: parseDate(rest.startDate),
    promotionDate: parseDate(rest.promotionDate),
  };

  return prisma.$transaction(async (tx) => {
    if (!id) {
      const created = await tx.member.create({
        data: {
          ...memberData,
          createdById: user.userId,
          branch: rest.branch || user.branch,
        },
      });

      await saveStatusHistory(tx, null, created);

      return mapMemberStatus(created);
    }

    const oldMember = await tx.member.findUnique({
      where: { id },
    });

    if (!oldMember) {
      throw {
        statusCode: 404,
        message: "Member not found",
      };
    }

    const updated = await tx.member.update({
      where: { id },
      data: memberData,
    });

    await saveStatusHistory(tx, oldMember, updated);

    return mapMemberStatus(updated);
  });
}

async function getMembers(user) {
  const members = await prisma.member.findMany({
    where: buildBranchFilter(user),
    select: {
      id: true,
      name: true,
      birthDate: true,
      gender: true,
      parish: true,
      church: true,
      startYear: true,
      startDate: true,
      branch: true,
      active: true,
      promotionDate: true,
      contact: true,
      fatherName: true,
      motherName: true,
      address: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return members.map(mapMemberStatus);
}

async function getMembersActive(user) {
  const members = await prisma.member.findMany({
    where: {
      active: true,
      ...buildBranchFilter(user),
    },
    select: {
      id: true,
      name: true,
      birthDate: true,
      gender: true,
      branch: true,
      active: true,
      promotionDate: true,
      contact: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return members.map(mapMemberStatus);
}
async function getMemberById(id) {
  const member = await prisma.member.findUnique({
    where: { id },
    include: {
      user: true,
      attendances: true,
      grades: true,
    },
  });

  if (!member) return null;

  return mapMemberStatus(member);
}

async function softDeleteMember(id) {
  return prisma.member.update({
    where: { id },
    data: { active: false },
  });
}

async function changeMemberStatus(memberId, active, promotionDate, note) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw {
      statusCode: 404,
      message: "Member not found",
    };
  }

  if (active && promotionDate) {
    throw {
      statusCode: 400,
      message: "Active member cannot have promotion date.",
    };
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.member.update({
      where: { id: memberId },
      data: {
        active,
        promotionDate: promotionDate,
      },
    });

    await saveStatusHistory(tx, member, updated, note);

    return updated;
  });
}
async function getMemberStatusHistory(memberId) {
  return prisma.memberStatusHistory.findMany({
    where: { memberId: Number(memberId) },
    orderBy: { date: "desc" },
  });
}

async function deleteHistory(ids) {
  return prisma.memberStatusHistory.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });
}

// === Branch Promotion ===
const BRANCH_LIST = [
  { level: 1, name: "Đồng" },
  { level: 2, name: "Thiếu" },
  { level: 3, name: "Thanh" },
];

/**
 * Trả về ngành của member tại một ngày cụ thể.
 *
 * Logic:
 * 1. Tìm record BRANCH_PROMOTED gần nhất có date <= targetDate.
 * 2. Nếu tìm thấy và có toBranch → return toBranch.
 * 3. Nếu không có lịch sử → return member.branch (ngành hiện tại).
 *
 * @param {number} memberId
 * @param {Date}   targetDate
 * @returns {Promise<string|null>} tên ngành
 */
async function getMemberBranchAtDate(memberId, targetDate) {
  // Lấy ngành hiện tại làm fallback
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { branch: true },
  });

  if (!member) return null;

  // Tìm record BRANCH_PROMOTED gần nhất trước hoặc bằng targetDate
  const historyRecord = await prisma.memberStatusHistory.findFirst({
    where: {
      memberId,
      type: "BRANCH_PROMOTED",
      date: { lte: targetDate },
    },
    orderBy: { date: "desc" },
  });

  if (historyRecord && historyRecord.toBranch) {
    return historyRecord.toBranch;
  }

  // Fallback: không có lịch sử hoặc record cũ không có toBranch
  return member.branch;
}

/**
 * Trả về ngành của member tại thời điểm chốt Quý (cuối quý).
 *
 * Grade của một Quý thuộc về Ngành tại thời điểm Quarter End.
 *
 * @param {number} memberId
 * @param {number} year
 * @param {number} quarter  (1-4)
 * @returns {Promise<string|null>}
 */
async function getMemberBranchAtQuarterEnd(memberId, year, quarter) {
  const startMonth = (quarter - 1) * 3;
  // Cuối tháng cuối của quý (giờ cuối ngày)
  const quarterEndDate = new Date(year, startMonth + 3, 0, 23, 59, 59);
  return getMemberBranchAtDate(memberId, quarterEndDate);
}

function getBranchLevel(branchName) {
  if (!branchName) return null;
  const normalized = branchName.trim().normalize("NFC");
  return BRANCH_LIST.find(
    (b) => normalized.toLowerCase() === b.name.toLowerCase()
  ) || null;
}

/**
 * Lên ngành cho member.
 *
 * @param {number} memberId
 * @param {string} [note]          - Ghi chú tùy chọn
 * @param {Date}   [effectiveDate] - Ngày nghiệp vụ thực tế lên ngành (mặc định = now)
 */
async function promoteBranch(memberId, note, effectiveDate) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw { statusCode: 404, message: "Member not found" };
  }

  const currentBranch = getBranchLevel(member.branch);

  if (!currentBranch) {
    throw {
      statusCode: 400,
      message: `Ngành hiện tại "${member.branch || "(trống)"}" không hợp lệ. Các ngành hợp lệ: ${BRANCH_LIST.map((b) => b.name).join(", ")}`,
    };
  }

  const nextBranch = BRANCH_LIST.find((b) => b.level === currentBranch.level + 1);

  if (!nextBranch) {
    throw {
      statusCode: 400,
      message: `Đoàn sinh đã ở ngành cao nhất (${currentBranch.name}), không thể lên ngành thêm.`,
    };
  }

  // Sử dụng effectiveDate nếu được truyền, ngược lại dùng ngày hiện tại
  const promotionDate = effectiveDate ? new Date(effectiveDate) : new Date();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.member.update({
      where: { id: memberId },
      data: { branch: nextBranch.name },
    });

    await tx.memberStatusHistory.create({
      data: {
        memberId,
        status: updated.active,
        type: "BRANCH_PROMOTED",
        date: promotionDate,
        note: note || `Lên ngành: ${currentBranch.name} → ${nextBranch.name}`,
        // ✅ Ghi lại lịch sử ngành đầy đủ cho historical resolver
        fromBranch: currentBranch.name,
        toBranch: nextBranch.name,
      },
    });

    return mapMemberStatus(updated);
  });
}

function getBranchList() {
  return BRANCH_LIST;
}

module.exports = {
  upsertMember,
  getMembers,
  getMemberById,
  softDeleteMember,
  getMembersActive,
  changeMemberStatus,
  getMemberStatusHistory,
  deleteHistory,
  promoteBranch,
  getBranchList,
  BRANCH_LIST,
  buildBranchFilter,
  getMemberBranchAtDate,
  getMemberBranchAtQuarterEnd,
};
