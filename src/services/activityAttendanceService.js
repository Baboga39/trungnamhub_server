// src/services/activityAttendanceService.js

const prisma = require("../libs/prisma");



async function markActivityAttendance(user, activityId, memberIds) {
  if (!Array.isArray(memberIds)) {
    throw { statusCode: 400, message: "memberIds must be an array" };
  }

  const activity = await prisma.activity.findUnique({
    where: { id: Number(activityId) },
  });

  if (!activity) {
    throw { statusCode: 404, message: "Activity not found" };
  }

  const operations = memberIds.map((memberId) =>
    prisma.activityAttendance.upsert({
      where: {
        activityId_memberId: {
          activityId: Number(activityId),
          memberId: Number(memberId),
        },
      },
      update: {
        markedById: user.userId,
      },
      create: {
        activityId: Number(activityId),
        memberId: Number(memberId),
        markedById: user.userId,
      },
    })
  );

  return prisma.$transaction(operations);
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

module.exports = {
  markActivityAttendance,
  getActivityAttendance,
};