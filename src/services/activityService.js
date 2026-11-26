// src/services/activityService.js
const { func } = require("joi");
const prisma = require("../libs/prisma");
const { sendNotification } = require("../libs/notifyClient");


async function upSertActivity(data, user) {
  const date = new Date(data.date);

  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3) + 1;

  const payload = {
    ...data,
    date,
    year,
    quarter,
    createdById: user.userId,
  };

  const saved = await prisma.activity.upsert({
    where: { id: data.id || 0 },
    update: payload,
    create: payload,
  });

  const isUpdate = Boolean(data.id);
  const dateStr = !isNaN(date.getTime()) ? date.toLocaleDateString("vi-VN") : "";
  sendNotification({
    eventType: "ACTIVITY_UPDATE",
    title: isUpdate ? "Cập nhật hoạt động ngoại khóa" : "Hoạt động ngoại khóa mới",
    message: `${saved.name || "Hoạt động mới"}${dateStr ? ` (${dateStr})` : ""} đã được ${isUpdate ? "cập nhật" : "tạo"}.`,
    severity: "info",
    actionUrl: "/activities",
    targetBranches: saved.branch ? [saved.branch] : [],
    actorUserId: user?.userId,
    excludeActor: true,
  });

  return saved;
}

function getActivities() {
  return prisma.activity.findMany({
    include: { createdBy: true },
  });
}

function deleteActivity(id) {
  return prisma.activity.delete({
    where: {
      id: Number(id),
    },
  });
}

module.exports = {
  upSertActivity,
  getActivities,
  deleteActivity,
};
