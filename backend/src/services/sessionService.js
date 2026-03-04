const prisma = require("../libs/prisma");


async function createSession(userId) {
  const session = await prisma.session.create({
    data: {
      date: new Date(),
      createdById: Number(userId),
      createdAt: new Date(),
    },
  });

  return session;
}


async function getSessionByDate(date) {
  return prisma.session.findUnique({
    where: { date },
  });
}

async function ensureSession(date, userId) {
  // check if exists
  let session = await getSessionByDate(date);

  if (!session) {
    session = await prisma.session.create({
      data: {
        date,
        createdById: Number(userId),
        createdAt: new Date(),
      },
    });
  }

  return session;
}

async function getAttendanceStreakTop(limit = 10) {
  const sessions = await prisma.session.findMany({
    orderBy: { date: "asc" },
    include: {
      attendances: true, // chỉ chứa vắng / trễ
    },
  });

  const members = await prisma.member.findMany({
    where: { active: true },
  });

  const memberMap = new Map();

  sessions.forEach((session) => {
    const absentOrLateIds = new Set(
      session.attendances.map((a) => a.memberId)
    );

    members.forEach((member) => {
      // Nếu member KHÔNG nằm trong danh sách vắng / trễ => xem như CÓ MẶT
      if (!absentOrLateIds.has(member.id)) {
        if (!memberMap.has(member.id)) {
          memberMap.set(member.id, {
            member,
            dates: [],
          });
        }
        memberMap.get(member.id).dates.push(session.date);
      }
    });
  });

  const result = [];

  memberMap.forEach((value, memberId) => {
    const dates = value.dates.sort((a, b) => new Date(a) - new Date(b));

    let longest = 1;
    let current = 1;
    let temp = 1;

    // longest streak
    for (let i = 1; i < dates.length; i++) {
      const diffWeeks =
        (new Date(dates[i]) - new Date(dates[i - 1])) /
        (1000 * 60 * 60 * 24 * 7);

      if (diffWeeks <= 1.1) {
        temp++;
        longest = Math.max(longest, temp);
      } else {
        temp = 1;
      }
    }

    // current streak (từ buổi gần nhất đếm ngược)
    for (let i = dates.length - 1; i > 0; i--) {
      const diffWeeks =
        (new Date(dates[i]) - new Date(dates[i - 1])) /
        (1000 * 60 * 60 * 24 * 7);

      if (diffWeeks <= 1.1) current++;
      else break;
    }

    result.push({
      id: memberId,
      fullName: value.member.name,
      parish: value.member.parish || "",
      currentStreak: current,
      longestStreak: longest,
    });
  });

  return result
    .sort((a, b) => b.longestStreak - a.longestStreak)
    .slice(0, limit);
}
module.exports = {
  createSession,
  getSessionByDate,
  ensureSession,
  getAttendanceStreakTop,
};
