const { parseDate } = require("../libs/parseDate");
const prisma = require("../libs/prisma");

async function upsertMember(data,user) {
  return prisma.member.upsert({
    where: { id: data.id || 0 },
    update: { ...data, birthDate: parseDate(data.birthDate), },
    create: { ...data, createdById: user.userId, birthDate: parseDate(data.birthDate) },
  });
}

async function getMembers() {
  return prisma.member.findMany({
    include: { user: true },
  });
}

async function getMembersActive(){
  return prisma.member.findMany({
    where: { active: true },
    include: { user: true },
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

async function changeMemberStatus( memberId, dateChange, note) {

  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw new Error("Member not found");
  }

  const newStatus = !member.active;
  const date = dateChange ? new Date(dateChange) : new Date();

  return await prisma.$transaction(async (tx) => {

    const updatedMember = await tx.member.update({
      where: { id: memberId },
      data: {
        active: newStatus,
      },
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
    orderBy: { date: 'desc' },
  });
}

async function deleteHistoryById(id) {
  return prisma.memberStatusHistory.delete({
    where: { id: Number(id) || id },
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
