// src/services/dashboardService.js
const prisma = require("../libs/prisma");
const { calculateTotalScoreDynamic } = require("../libs/scoreCalculator");
const { buildBranchFilter } = require("./member.service");

function calcTrendPercent(current, previous) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

const ATTENDANCE_EQUIVALENTS = {
  absent: 1,
  unexcused: 1,
  late: 0.5,
  excused: 0.2,
  present: 0,
};

function formatSessionDate(date) {
  if (!date) return "";
  if (typeof date === "string" && date.includes("/")) {
    return date;
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

async function calculateSessionAttendance(sessionDate, branchFilter) {
  if (!sessionDate) return null;

  const [totalMembers, attendances] = await Promise.all([
    prisma.member.count({
      where: {
        active: true,
        createdAt: { lte: sessionDate },
        ...branchFilter,
      },
    }),
    prisma.attendance.findMany({
      where: {
        date: sessionDate,
        member: { ...branchFilter },
      },
      select: { status: true, memberId: true },
    }),
  ]);

  const absentEq = attendances.reduce((acc, a) => {
    return acc + (ATTENDANCE_EQUIVALENTS[a.status] !== undefined ? ATTENDANCE_EQUIVALENTS[a.status] : 1);
  }, 0);

  const presentCount = Math.max(0, Math.round(totalMembers - absentEq));
  const rate =
    totalMembers > 0
      ? Number(((Math.max(0, totalMembers - absentEq) / totalMembers) * 100).toFixed(1))
      : 0;

  return {
    date: formatSessionDate(sessionDate),
    rawDate: sessionDate,
    totalMembers,
    presentCount,
    rate,
  };
}

async function getDashboardStats(user) {
  const now = new Date();
  const branchFilter = buildBranchFilter(user);

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
  ] = await Promise.all([
    prisma.member.count({ where: { active: true, createdAt: { lte: now }, ...branchFilter } }),
    prisma.member.count({ where: { active: true, createdAt: { lte: endOfLastMonth }, ...branchFilter } }),

    // managers (User) are not branch-filtered
    prisma.user.count({ where: { active: true, createdAt: { lte: now } } }),
    prisma.user.count({ where: { active: true, createdAt: { lte: endOfLastMonth } } }),
  ]);

  // Query 2 recent sessions on or before now
  const sessionWhere = {
    date: { lte: now },
  };
  if (branchFilter.branch) {
    sessionWhere.branch = branchFilter.branch;
  }

  let recentSessions = await prisma.session.findMany({
    where: sessionWhere,
    orderBy: { date: "desc" },
    take: 2,
    select: { date: true },
  });

  // Fallback: If sessions table has no records, check distinct attendance dates
  if (recentSessions.length === 0) {
    const attWhere = {
      date: { lte: now },
    };
    if (branchFilter.branch) {
      attWhere.member = { branch: branchFilter.branch };
    }
    const distinctDates = await prisma.attendance.findMany({
      where: attWhere,
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "desc" },
      take: 2,
    });
    recentSessions = distinctDates;
  }

  const latestSessionData = await calculateSessionAttendance(recentSessions[0]?.date, branchFilter);
  const prevSessionData = recentSessions[1]
    ? await calculateSessionAttendance(recentSessions[1]?.date, branchFilter)
    : null;

  let latestAttendance = {
    hasData: false,
    rate: 0,
    presentCount: 0,
    totalMembers: 0,
    date: null,
    trend: 0,
    trendPercent: 0,
  };

  if (latestSessionData) {
    const trend = prevSessionData
      ? Number((latestSessionData.rate - prevSessionData.rate).toFixed(1))
      : 0;
    const trendPercent = prevSessionData
      ? calcTrendPercent(latestSessionData.rate, prevSessionData.rate)
      : 0;

    latestAttendance = {
      hasData: true,
      rate: latestSessionData.rate,
      presentCount: latestSessionData.presentCount,
      totalMembers: latestSessionData.totalMembers,
      date: latestSessionData.date,
      trend,
      trendPercent,
    };
  }

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
    latestAttendance,
    attendanceRate: {
      value: latestAttendance.rate,
      trend: latestAttendance.trend,
      trendPercent: latestAttendance.trendPercent,
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
    where: {
      branch: branchFilter.branch || undefined,
    },
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

async function getQuarterlyBirthdays(user, queryQuarter, queryYear) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentQuarter = Math.ceil(currentMonth / 3); // 1-4

  let quarter, year, branch;
  if (typeof queryQuarter === "object" && queryQuarter !== null) {
    quarter = queryQuarter.quarter ? Number(queryQuarter.quarter) : currentQuarter;
    year = queryQuarter.year ? Number(queryQuarter.year) : now.getFullYear();
    branch = queryQuarter.branch;
  } else {
    quarter = queryQuarter ? Number(queryQuarter) : currentQuarter;
    year = queryYear ? Number(queryYear) : now.getFullYear();
  }

  let branchFilter = buildBranchFilter(user);
  if (branch && branch !== "all") {
    branchFilter = { branch };
  }

  // Quarter months (1-indexed)
  const quarterMonths = [(quarter - 1) * 3 + 1, (quarter - 1) * 3 + 2, (quarter - 1) * 3 + 3];

  const members = await prisma.member.findMany({
    where: {
      active: true,
      birthDate: { not: null },
      ...branchFilter,
    },
    select: {
      id: true,
      name: true,
      birthDate: true,
      gender: true,
      parish: true,
      church: true,
      branch: true,
      group: true,
    },
  });

  const matchingMembers = [];

  for (const m of members) {
    if (!m.birthDate) continue;
    const bDate = new Date(m.birthDate);
    const bMonth = bDate.getMonth() + 1; // 1-12
    const bDay = bDate.getDate();
    const bYear = bDate.getFullYear();

    if (quarterMonths.includes(bMonth)) {
      const age = bYear ? year - bYear : null;
      const isToday = (bMonth === currentMonth && bDay === now.getDate());
      const isThisMonth = (bMonth === currentMonth);

      const formattedDay = String(bDay).padStart(2, "0");
      const formattedMonth = String(bMonth).padStart(2, "0");
      const formattedDate = `${formattedDay}/${formattedMonth}`;

      matchingMembers.push({
        id: m.id,
        fullName: m.name,
        birthDate: m.birthDate,
        birthDay: bDay,
        birthMonth: bMonth,
        birthYear: bYear,
        formattedDate,
        age,
        parish: m.parish || "",
        church: m.church || "",
        branch: m.branch || "",
        group: m.group || "",
        gender: m.gender || "",
        isToday,
        isThisMonth,
      });
    }
  }

  // Sort by birthMonth, then birthDay
  matchingMembers.sort((a, b) => {
    if (a.birthMonth !== b.birthMonth) {
      return a.birthMonth - b.birthMonth;
    }
    return a.birthDay - b.birthDay;
  });

  // Group by month
  const byMonth = quarterMonths.map((m) => {
    const monthMembers = matchingMembers.filter((item) => item.birthMonth === m);
    return {
      month: m,
      monthName: `Tháng ${m}`,
      count: monthMembers.length,
      members: monthMembers,
    };
  });

  return {
    quarter,
    year,
    quarterMonths,
    total: matchingMembers.length,
    byMonth,
    members: matchingMembers,
  };
}

module.exports = {
  getDashboardStats,
  getRiskMembers,
  getAttendanceStreakTop,
  getQuarterlyBirthdays,
};

