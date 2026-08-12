// src/services/dashboardService.js
const prisma = require("../libs/prisma");
const { calculateTotalScoreDynamic } = require("../libs/scoreCalculator");
const { buildBranchFilter } = require("./member.service");

function calcTrendPercent(current, previous) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

async function getDashboardStats(user) {
  const now = new Date();
  const branchFilter = buildBranchFilter(user);

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
  ] = await Promise.all([
    prisma.member.count({ where: { active: true, createdAt: { lte: now }, ...branchFilter } }),
    prisma.member.count({ where: { active: true, createdAt: { lte: endOfLastMonth }, ...branchFilter } }),

    // managers (User) are not branch-filtered
    prisma.user.count({ where: { active: true, createdAt: { lte: now } } }),
    prisma.user.count({ where: { active: true, createdAt: { lte: endOfLastMonth } } }),

    // attendance counts filtered by member branch via nested where
    prisma.attendance.count({
      where: {
        date: { gte: startOfThisMonth, lte: now },
        member: { ...branchFilter },
      },
    }),
    prisma.attendance.count({
      where: {
        date: { gte: startOfLastMonth, lte: endOfLastMonth },
        member: { ...branchFilter },
      },
    }),

    prisma.member.count({ where: { active: true, createdAt: { lte: now }, ...branchFilter } }),
    prisma.member.count({ where: { active: true, createdAt: { lte: endOfLastMonth }, ...branchFilter } }),
  ]);

  let totalSessionsThisYear = 0;
  let totalSessionsLastYear = 0;

  if (branchFilter.branch) {
    const [thisYearRecords, lastYearRecords] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          member: { branch: branchFilter.branch },
          date: { gte: startOfYear, lte: endOfYear },
        },
        select: { date: true },
        distinct: ["date"],
      }),
      prisma.attendance.findMany({
        where: {
          member: { branch: branchFilter.branch },
          date: { gte: lastYearStart, lte: lastYearEnd },
        },
        select: { date: true },
        distinct: ["date"],
      }),
    ]);
    totalSessionsThisYear = thisYearRecords.length;
    totalSessionsLastYear = lastYearRecords.length;
  } else {
    [totalSessionsThisYear, totalSessionsLastYear] = await Promise.all([
      prisma.session.count({ where: { date: { gte: startOfYear, lte: endOfYear } } }),
      prisma.session.count({ where: { date: { gte: lastYearStart, lte: lastYearEnd } } }),
    ]);
  }

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

async function getRiskMembers(user) {
  const branchFilter = buildBranchFilter(user);

  const now = new Date();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(now.getMonth() - 6);
  const currentYear = now.getFullYear();

  const members = await prisma.member.findMany({
    where: { active: true, ...branchFilter },
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
          year: currentYear,
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

async function getAttendanceStreakTop(user, limit = 10) {
  const branchFilter = buildBranchFilter(user);

  // ============================================================
  // 1. Lấy toàn bộ session
  // ============================================================
  const sessions = await prisma.session.findMany({
    orderBy: {
      date: "asc",
    },
    select: {
      id: true,
      date: true,
      branch: true,
    },
  });

  // ============================================================
  // 2. Lấy member
  // ============================================================
  const members = await prisma.member.findMany({
    where: {
      active: true,
      ...branchFilter,
    },

    select: {
      id: true,
      name: true,
      parish: true,
      branch: true,
      startDate: true,

      attendances: {
        select: {
          sessionId: true,
          status: true,
        },
      },

      // Không filter type ở đây.
      // Vì DB thực tế có thể đang lưu "PROMOTED",
      // "Chuyển ngành", hoặc giá trị khác.
      statusHistory: {
        orderBy: {
          date: "desc",
        },
        select: {
          id: true,
          date: true,
          type: true,
          fromBranch: true,
          toBranch: true,
        },
      },
    },
  });

  const results = [];

  // ============================================================
  // 3. Tính streak cho từng member
  // ============================================================
  for (const m of members) {
    // ----------------------------------------------------------
    // Xác định ngày bắt đầu tính streak
    // ----------------------------------------------------------

    let streakStartDate = m.startDate || null;

    // Nếu member đang thuộc một branch
    if (m.branch) {
      /*
       * Tìm lần chuyển gần nhất mà:
       *
       * toBranch = branch hiện tại
       *
       * Ví dụ:
       *
       * Member.branch = "Thiếu"
       *
       * History:
       *
       * 10/08/2026
       * fromBranch = "Đồng"
       * toBranch   = "Thiếu"
       *
       * => streakStartDate = 10/08/2026
       */

      const latestBranchChange = m.statusHistory.find(
        (history) =>
          history.toBranch === m.branch &&
          history.date <= new Date()
      );

      if (latestBranchChange) {
        streakStartDate = latestBranchChange.date;
      }
    }

    // ----------------------------------------------------------
    // Chuẩn hóa ngày bắt đầu
    //
    // Nếu lên ngành ngày 10/08 thì tính session từ đầu ngày
    // 10/08 trở đi.
    // ----------------------------------------------------------

    if (streakStartDate) {
      streakStartDate = new Date(streakStartDate);

      streakStartDate.setHours(
        0,
        0,
        0,
        0
      );
    }

    // ----------------------------------------------------------
    // Map attendance
    // sessionId -> status
    // ----------------------------------------------------------

    const attendanceMap = new Map(
      m.attendances
        .filter((a) => a.sessionId !== null)
        .map((a) => [
          a.sessionId,
          a.status,
        ])
    );

    // ----------------------------------------------------------
    // Chỉ lấy session:
    //
    // 1. Đúng branch hiện tại
    // 2. Sau ngày bắt đầu branch hiện tại
    // ----------------------------------------------------------

    const validSessions = sessions.filter((session) => {
      // -----------------------------------------
      // Branch
      // -----------------------------------------
      if (m.branch) {
        if (session.branch !== m.branch) {
          return false;
        }
      }

      // -----------------------------------------
      // Ngày bắt đầu
      // -----------------------------------------
      if (
        streakStartDate &&
        session.date < streakStartDate
      ) {
        return false;
      }

      return true;
    });

    // Không có session
    if (validSessions.length === 0) {
      continue;
    }

    // ============================================================
    // 4. LONGEST STREAK
    // ============================================================

    let longestStreak = 0;
    let tempStreak = 0;

    for (const session of validSessions) {
      const status = attendanceMap.get(
        session.id
      );

      /*
       * Không có attendance record
       * => xem như có mặt
       *
       * Có record:
       * absent / late / ...
       * => đứt chuỗi
       */

      if (!status) {
        tempStreak++;

        longestStreak = Math.max(
          longestStreak,
          tempStreak
        );
      } else {
        tempStreak = 0;
      }
    }

    // ============================================================
    // 5. CURRENT STREAK
    // ============================================================

    let currentStreak = 0;

    for (
      let i = validSessions.length - 1;
      i >= 0;
      i--
    ) {
      const session = validSessions[i];

      const status = attendanceMap.get(
        session.id
      );

      if (!status) {
        currentStreak++;
      } else {
        break;
      }
    }

    // ============================================================
    // 6. Result
    // ============================================================

    if (
      currentStreak > 0 ||
      longestStreak > 0
    ) {
      results.push({
        id: m.id,
        fullName: m.name,
        parish: m.parish || "",
        branch: m.branch || "",

        currentStreak,
        longestStreak,

        // Debug / frontend nếu cần
        streakStartDate,
      });
    }
  }

  // ============================================================
  // 7. Sort
  // ============================================================

  return results
    .sort((a, b) => {
      if (
        b.currentStreak !==
        a.currentStreak
      ) {
        return (
          b.currentStreak -
          a.currentStreak
        );
      }

      return (
        b.longestStreak -
        a.longestStreak
      );
    })
    .slice(
      0,
      Number(limit) || 10
    );
}
module.exports = {
  getDashboardStats,
  getRiskMembers,
  getAttendanceStreakTop,
};
