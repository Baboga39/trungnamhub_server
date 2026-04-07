const { parseDate } = require("../libs/parseDate");
const prisma = require("../libs/prisma");

function normalizeBranch(branch) {
  return branch?.trim().normalize("NFC");
}

function buildBranchFilter(user) {
  if (user?.role === "admin") return {};
  console.log(user.branch)

  const branch = normalizeBranch(user?.branch);

  if (branch) return { branch };

  throw { statusCode: 403, message: "User does not have a branch assigned" };
}
async function upsertMember(data, user) {
  const { id, ...rest } = data;
  return prisma.member.upsert({
    where: { id: id || 0 },
    update: {
      ...rest,
      birthDate: parseDate(rest.birthDate),
    },
    create: {
      ...rest,
      createdById: user.userId,
      birthDate: parseDate(rest.birthDate),
      branch: rest.branch || user.branch,
    },
  });
}

async function getMembers(user) {
  return prisma.member.findMany({
    where: buildBranchFilter(user),
    select: {
      id: true,
      name: true,
      birthDate: true,
      gender: true,
      parish: true,
      church: true,
      startYear: true,
      branch: true,
      active: true,
      contact: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

async function getMembersActive(user) {
  const branchFilter = buildBranchFilter(user);
  return prisma.member.findMany({
    where: { active: true, ...buildBranchFilter(user) },
    select: {
      id: true,
      name: true,
      birthDate: true,
      gender: true,
      branch: true,
      contact: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

async function getMemberById(id) {
  return prisma.member.findUnique({
    where: { id },
    include: { user: true, attendances: true, grades: true },
  });
}

async function softDeleteMember(id) {
  return prisma.member.update({
    where: { id },
    data: { active: false },
  });
}

async function changeMemberStatus(memberId, dateChange, note) {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) throw { statusCode: 404, message: "Member not found" };

  const newStatus = !member.active;
  const date = dateChange ? new Date(dateChange) : new Date();

  return prisma.$transaction(async (tx) => {
    const updatedMember = await tx.member.update({
      where: { id: memberId },
      data: { active: newStatus },
    });
    await tx.memberStatusHistory.create({
      data: {
        memberId,
        status: newStatus,
        date,
        note: note || (newStatus ? "Activated" : "Deactivated"),
      },
    });
    return updatedMember;
  });
}

async function getMemberStatusHistory(memberId) {
  return prisma.memberStatusHistory.findMany({
    where: { memberId: Number(memberId) },
    orderBy: { date: "desc" },
  });
}

async function deleteHistoryById(id) {
  return prisma.memberStatusHistory.delete({
    where: { id: Number(id) },
  });
}

module.exports = {
  upsertMember,
  getMembers,
  getMemberById,
  softDeleteMember,
  getMembersActive,
  changeMemberStatus,
  getMemberStatusHistory,
  deleteHistoryById,
};