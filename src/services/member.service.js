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
    where: { active: true },
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

module.exports = {
  upsertMember,
  getMembers,
  getMemberById,
  softDeleteMember,
  getMembersActive
};
