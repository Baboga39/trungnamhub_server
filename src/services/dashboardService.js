// src/services/dashboardService.js
const prisma = require("../libs/prisma");
const { calculateTotalScoreDynamic } = require("../libs/scoreCalculator");

function calcTrendPercent(current, previous) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

async function getDashboardStats() {
  const now = new Date();

  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);

  const [
    totalMembersThisMonth,
    totalMembersLastMonth,

    totalManagersThisMonth,
    totalManagersLastMonth,

    attendanceThisMonth,
    attendanceLastMonth,

    totalActiveThisMonth,
    totalActiveLastMonth,

    totalSessionsThisYear,
    totalSessionsLastYear,
  ] = await Promise.all([
    prisma.member.count({ where: { active: true, createdAt: { lte: now } } }),
    prisma.member.count({ where: { active: true, createdAt: { lte: endOfLastMonth } } }),

    prisma.user.count({ where: { active: true, createdAt: { lte: now } } }),
    prisma.user.count({ where: { active: true, createdAt: { lte: endOfLastMonth } } }),

    prisma.attendance.count({ where: { date: { gte: startOfThisMonth, lte: now } } }),
    prisma.attendance.count({ where: { date: { gte: startOfLastMonth, lte: endOfLastMonth } } }),

    prisma.member.count({ where: { active: true, createdAt: { lte: now } } }),
    prisma.member.count({ where: { active: true, createdAt: { lte: endOfLastMonth } } }),

    prisma.session.count({ where: { date: { gte: startOfYear, lte: endOfYear } } }),
    prisma.session.count({ where: { date: { gte: lastYearStart, lte: lastYearEnd } } }),
  ]);

  const attendanceRateThisMonth = totalActiveThisMonth
    ? (attendanceThisMonth / totalActiveThisMonth) * 100
    : 0;

  const attendanceRateLastMonth = totalActiveLastMonth
    ? (attendanceLastMonth / totalActiveLastMonth) * 100
    : 0;

  return {
    totalMembers: {
      value: totalMembersThisMonth,
      trend: totalMembersThisMonth - totalMembersLastMonth,
      trendPercent: calcTrendPercent(totalMembersThisMonth, totalMembersLastMonth),
    },
    totalManagers: {
      value: totalManagersThisMonth,
      trend: totalManagersThisMonth - totalManagersLastMonth,
      trendPercent: calcTrendPercent(totalManagersThisMonth, totalManagersLastMonth),
    },
    attendanceRate: {
      value: Number(attendanceRateThisMonth.toFixed(2)),
      trend: Number((attendanceRateThisMonth - attendanceRateLastMonth).toFixed(2)),
      trendPercent: calcTrendPercent(attendanceRateThisMonth, attendanceRateLastMonth),
    },
    totalSessions: {
      value: totalSessionsThisYear,
      trend: totalSessionsThisYear - totalSessionsLastYear,
      trendPercent: calcTrendPercent(totalSessionsThisYear, totalSessionsLastYear),
      year: now.getFullYear(),
    },
  };
}
async function getRiskMembers() {
  const now = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(now.getMonth() - 6);
  const currentYear = now.getFullYear();

  const members = await prisma.member.findMany({
    where: { active: true },
    include: {
      attendances: {
        where: {
          date: {
            gte: sixMonthsAgo,
            lte: now,
          },
        },
      },
      grades: {
        where: {
          yearActive: currentYear,
        },
      },
    },
  });

  const categories = await prisma.gradeCategory.findMany({
    where: { active: true },
  });

  const result = [];

  members.forEach((m) => {
    // 1️⃣ Đếm số buổi vắng / trễ trong 6 tháng
    const absentCount = m.attendances.filter(
      (a) => a.status === "absent" || a.status === "late"
    ).length;

    // 2️⃣ Tính điểm trung bình năm hiện tại
    let averageGrade = null;

    if (m.grades.length > 0) {
      const formData = {};

      m.grades.forEach((g) => {
        const cat = categories.find((c) => c.id === g.categoryId);
        if (cat) {
          formData[cat.name] = g.score;
        }
      });

      averageGrade = calculateTotalScoreDynamic(formData, categories);
    }

    // 3️⃣ Điều kiện đoàn sinh nguy cơ
    if (absentCount >= 3 && averageGrade !== null && averageGrade < 6.5) {
      const riskScore = Math.round(
        absentCount * 15 + (10 - averageGrade) * 10
      );

      let riskLevel = "low";
      if (riskScore >= 70) riskLevel = "high";
      else if (riskScore >= 40) riskLevel = "medium";

      result.push({
        id: m.id,
        fullName: m.name,
        parish: m.parish || "",
        riskScore,
        riskLevel,
        absentCount,
        averageGrade,
        period: {
          attendanceFrom: sixMonthsAgo,
          attendanceTo: now,
          gradeYear: currentYear,
        },
        reasons: [
          `Vắng ${absentCount} buổi trong 6 tháng gần nhất`,
          `Điểm trung bình năm ${currentYear} thấp (${averageGrade.toFixed(1)})`,
        ],
      });
    }
  });

  // Top 5 nguy cơ cao nhất
  return result
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5);
}

async function getAttendanceStreakTop(limit = 10) {
  // 1️⃣ Lấy tất cả session theo thứ tự thời gian
  const sessions = await prisma.session.findMany({
    orderBy: { date: "asc" },
    select: { id: true, date: true },
  });

  // 2️⃣ Lấy đoàn sinh + attendance (chỉ absent / late)
  const members = await prisma.member.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      parish: true,
      attendances: {
        select: {
          sessionId: true,
          status: true, // absent | late
        },
      },
    },
  });

  const results = [];

  members.forEach((m) => {
    // Map nhanh sessionId → status
    const attendanceMap = new Map();
    m.attendances.forEach((a) => {
      attendanceMap.set(a.sessionId, a.status);
    });

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // 3️⃣ Tính longest streak
    sessions.forEach((s) => {
      const status = attendanceMap.get(s.id);

      // Không có record => present
      if (!status) {
        tempStreak += 1;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        // absent hoặc late
        tempStreak = 0;
      }
    });

    // 4️⃣ Tính current streak (từ session mới nhất)
    for (let i = sessions.length - 1; i >= 0; i--) {
      const status = attendanceMap.get(sessions[i].id);
      if (!status) {
        currentStreak += 1;
      } else {
        break;
      }
    }

    // Optional: chỉ lấy những người có streak > 0
    if (currentStreak > 0 || longestStreak > 0) {
      results.push({
        id: m.id,
        fullName: m.name,
        parish: m.parish || "",
        currentStreak,
        longestStreak,
      });
    }
  });

  // 5️⃣ Sort & lấy top
  return results
    .sort((a, b) => {
      if (b.currentStreak !== a.currentStreak) {
        return b.currentStreak - a.currentStreak;
      }
      return b.longestStreak - a.longestStreak;
    })
    .slice(0, limit);
}


module.exports = {
  getDashboardStats,
  getRiskMembers,
  getAttendanceStreakTop,
};
