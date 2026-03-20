// src/services/activityAttendanceService.js

const prisma = require("../libs/prisma");



async function markActivityAttendance(user, activityId, memberIds) {
  if (!Array.isArray(memberIds)) {
    throw { statusCode: 400, message: "memberIds must be an array" };
  }

  const activityIdNum = Number(activityId);

  // 1. Lấy current attendance
  const existing = await prisma.activityAttendance.findMany({
    where: { activityId: activityIdNum },
    select: { memberId: true },
  });

  const existingIds = existing.map((e) => e.memberId);

  // 2. Convert về number 
  const newIds = memberIds.map(Number);

  // 3. Diff
  const toCreate = newIds.filter((id) => !existingIds.includes(id));
  const toDelete = existingIds.filter((id) => !newIds.includes(id));

  // 4. Execute transaction
  return prisma.$transaction([
    // create mới
    prisma.activityAttendance.createMany({
      data: toCreate.map((memberId) => ({
        activityId: activityIdNum,
        memberId,
        markedById: user.userId,
      })),
      skipDuplicates: true,
    }),

    // xóa những cái không còn
    prisma.activityAttendance.deleteMany({
      where: {
        activityId: activityIdNum,
        memberId: { in: toDelete },
      },
    }),
  ]);
}

async function getActivityAttendance(activityId) {
  return prisma.activityAttendance.findMany({
    where: { activityId: Number(activityId) },
    include: {
      member: { select: { id: true, name: true, church: true } },
      markedBy: { select: { id: true, name: true } },
    },
  });
}

async function deleteActivityAttendance(ids) {
  return prisma.activityAttendance.deleteMany({
    where: {
      id: {
        in: ids.map(Number),
      },
    },
  });
}

module.exports = {
  markActivityAttendance,
  getActivityAttendance,
  deleteActivityAttendance,
};