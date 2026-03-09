// src/services/activityService.js
const { func } = require("joi");
const prisma = require("../libs/prisma");


function upSertActivity(data, user) {
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

  return prisma.activity.upsert({
    where: { id: data.id || 0 },
    update: payload,
    create: payload,
  });
}

function getActivities() {
  return prisma.activity.findMany({
    include: { createdBy: true },
  });
}

module.exports = {
  upSertActivity,
  getActivities,
};
