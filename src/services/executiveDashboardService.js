// src/services/executiveDashboardService.js
const prisma = require("../libs/prisma");
const { calculateTotalScoreDynamic, getRank } = require("../libs/scoreCalculator");
const { buildBranchFilter, getMemberBranchAtQuarterEnd } = require("./member.service");


function normalizeDbBranch(branchStr) {
  if (!branchStr || branchStr === "all") return null;
  let s = String(branchStr).trim();
  if (s.startsWith("Ngành ")) {
    s = s.replace("Ngành ", "").trim();
  }
  return s;
}

function getDisplayBranchName(branchStr) {
  if (!branchStr) return "";
  if (branchStr.startsWith("Ngành ")) return branchStr;
  return `Ngành ${branchStr}`;
}

function getQuarterDateRanges(year, quarter) {
  const y = Number(year) || new Date().getFullYear();
  const q = Number(quarter) || (Math.floor(new Date().getMonth() / 3) + 1);

  const startMonth = (q - 1) * 3;
  const startDate = new Date(y, startMonth, 1, 0, 0, 0);
  const endDate = new Date(y, startMonth + 3, 0, 23, 59, 59);

  const prevQ = q === 1 ? 4 : q - 1;
  const prevY = q === 1 ? y - 1 : y;
  const prevStartMonth = (prevQ - 1) * 3;
  const prevStartDate = new Date(prevY, prevStartMonth, 1, 0, 0, 0);
  const prevEndDate = new Date(prevY, prevStartMonth + 3, 0, 23, 59, 59);

  return {
    year: y,
    quarter: q,
    startDate,
    endDate,
    prevYear: prevY,
    prevQuarter: prevQ,
    prevStartDate,
    prevEndDate,
  };
}

function isAdminUser(user) {
  if (!user) return false;
  const role = String(user.role || "").toLowerCase();
  const branchStr = String(user.branch || "").toLowerCase();
  return role === "admin" || branchStr === "admin";
}

/**
 * Builds standard scoped filter based on user role and query branch override.
 */
function getEffectiveBranchFilter(user, requestedBranch) {
  if (isAdminUser(user)) {
    const norm = normalizeDbBranch(requestedBranch);
    if (norm) {
      return { branch: norm };
    }
    return {};
  }
  const rawFilter = buildBranchFilter(user);
  if (rawFilter && rawFilter.branch) {
    const norm = normalizeDbBranch(rawFilter.branch);
    return { branch: norm };
  }
  return {};
}

function calcTrendPercent(current, previous) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. OVERVIEW KPIS
// ─────────────────────────────────────────────────────────────────────────────
async function getExecutiveOverview(user, { year, quarter, branch }) {
  const dateRange = getQuarterDateRanges(year, quarter);
  const branchFilter = getEffectiveBranchFilter(user, branch);

  const { startDate, endDate, prevStartDate, prevEndDate } = dateRange;

  const [
    totalMembers,
    prevTotalMembers,
    attendances,
    prevAttendances,
    sessions,
    prevSessions,
    grades,
    prevGrades,
    categories,
    activities,
    prevActivities,
  ] = await Promise.all([
    prisma.member.count({ where: { active: true, ...branchFilter } }),
    prisma.member.count({ where: { active: true, ...branchFilter } }),

    // Attendance records in quarter
    prisma.attendance.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        member: { active: true, ...branchFilter },
      },
      select: { status: true, memberId: true },
    }),
    prisma.attendance.findMany({
      where: {
        date: { gte: prevStartDate, lte: prevEndDate },
        member: { active: true, ...branchFilter },
      },
      select: { status: true, memberId: true },
    }),

    // Session counts
    branchFilter.branch
      ? prisma.session.findMany({
          where: { branch: branchFilter.branch, date: { gte: startDate, lte: endDate } },
          select: { id: true },
        })
      : prisma.session.findMany({
          where: { date: { gte: startDate, lte: endDate } },
          select: { id: true },
        }),
    branchFilter.branch
      ? prisma.session.findMany({
          where: { branch: branchFilter.branch, date: { gte: prevStartDate, lte: prevEndDate } },
          select: { id: true },
        })
      : prisma.session.findMany({
          where: { date: { gte: prevStartDate, lte: prevEndDate } },
          select: { id: true },
        }),

    // Grades
    prisma.grade.findMany({
      where: {
        year: dateRange.year,
        quarter: dateRange.quarter,
        mMember: { active: true, ...branchFilter },
      },
      include: { category: true },
    }),
    prisma.grade.findMany({
      where: {
        year: dateRange.prevYear,
        quarter: dateRange.prevQuarter,
        mMember: { active: true, ...branchFilter },
      },
      include: { category: true },
    }),

    prisma.gradeCategory.findMany({ where: { active: true } }),

    // Activities
    prisma.activityAttendance.findMany({
      where: {
        activity: { year: dateRange.year, quarter: dateRange.quarter },
        member: { active: true, ...branchFilter },
      },
    }),
    prisma.activityAttendance.findMany({
      where: {
        activity: { year: dateRange.prevYear, quarter: dateRange.prevQuarter },
        member: { active: true, ...branchFilter },
      },
    }),
  ]);

  // Attendance rate calculation
  const totalSessionsCount = sessions.length || 1;
  const prevTotalSessionsCount = prevSessions.length || 1;

  const totalPotentialVisits = totalMembers * totalSessionsCount;
  const prevTotalPotentialVisits = prevTotalMembers * prevTotalSessionsCount;

  const absentEq = attendances.reduce((acc, a) => {
    if (a.status === "absent") return acc + 1;
    if (a.status === "late") return acc + 0.5;
    if (a.status === "excused") return acc + 0.2;
    return acc;
  }, 0);

  const prevAbsentEq = prevAttendances.reduce((acc, a) => {
    if (a.status === "absent") return acc + 1;
    if (a.status === "late") return acc + 0.5;
    if (a.status === "excused") return acc + 0.2;
    return acc;
  }, 0);

  const presentEq = Math.max(0, totalPotentialVisits - absentEq);
  const prevPresentEq = Math.max(0, prevTotalPotentialVisits - prevAbsentEq);

  const attendanceRate = totalPotentialVisits > 0 ? Number(((presentEq / totalPotentialVisits) * 100).toFixed(1)) : 0;
  const prevAttendanceRate = prevTotalPotentialVisits > 0 ? Number(((prevPresentEq / prevTotalPotentialVisits) * 100).toFixed(1)) : 0;

  // Average Score calculation
  const memberScoresMap = {};
  for (const g of grades) {
    if (!memberScoresMap[g.memberId]) memberScoresMap[g.memberId] = {};
    memberScoresMap[g.memberId][g.category.name] = g.score;
  }
  const scoreValues = Object.values(memberScoresMap).map((scores) => calculateTotalScoreDynamic(scores, categories));
  const avgScore = scoreValues.length > 0 ? Number((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(1)) : 0;

  const prevMemberScoresMap = {};
  for (const g of prevGrades) {
    if (!prevMemberScoresMap[g.memberId]) prevMemberScoresMap[g.memberId] = {};
    prevMemberScoresMap[g.memberId][g.category.name] = g.score;
  }
  const prevScoreValues = Object.values(prevMemberScoresMap).map((scores) => calculateTotalScoreDynamic(scores, categories));
  const prevAvgScore = prevScoreValues.length > 0 ? Number((prevScoreValues.reduce((a, b) => a + b, 0) / prevScoreValues.length).toFixed(1)) : 0;

  // Activity participation rate
  const totalQuarterActivities = await prisma.activity.count({
    where: { year: dateRange.year, quarter: dateRange.quarter },
  });
  const maxPossibleActivityJoins = totalMembers * (totalQuarterActivities || 1);
  const joinedActivityCount = activities.length;
  const activityRate = maxPossibleActivityJoins > 0 ? Number(((joinedActivityCount / maxPossibleActivityJoins) * 100).toFixed(1)) : 0;

  const prevTotalQuarterActivities = await prisma.activity.count({
    where: { year: dateRange.prevYear, quarter: dateRange.prevQuarter },
  });
  const prevMaxPossibleActivityJoins = prevTotalMembers * (prevTotalQuarterActivities || 1);
  const prevJoinedActivityCount = prevActivities.length;
  const prevActivityRate = prevMaxPossibleActivityJoins > 0 ? Number(((prevJoinedActivityCount / prevMaxPossibleActivityJoins) * 100).toFixed(1)) : 0;

  // Risk Members Count
  const riskList = await getExecutiveRiskMembers(user, { year, quarter, branch });
  const riskCount = riskList.length;

  return {
    year: dateRange.year,
    quarter: dateRange.quarter,
    totalMembers: {
      value: totalMembers,
      diff: totalMembers - prevTotalMembers,
      trendPercent: calcTrendPercent(totalMembers, prevTotalMembers),
    },
    attendanceRate: {
      value: attendanceRate,
      diff: Number((attendanceRate - prevAttendanceRate).toFixed(1)),
      trendPercent: calcTrendPercent(attendanceRate, prevAttendanceRate),
    },
    averageScore: {
      value: avgScore,
      diff: Number((avgScore - prevAvgScore).toFixed(1)),
      trendPercent: calcTrendPercent(avgScore, prevAvgScore),
    },
    activityParticipation: {
      value: activityRate,
      diff: Number((activityRate - prevActivityRate).toFixed(1)),
      trendPercent: calcTrendPercent(activityRate, prevActivityRate),
    },
    riskMembers: {
      value: riskCount,
      diff: riskCount,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BRANCH PERFORMANCE COMPARISON
// ─────────────────────────────────────────────────────────────────────────────
async function getExecutiveBranchPerformance(user, { year, quarter }) {
  const dateRange = getQuarterDateRanges(year, quarter);
  // Database branch values
  const dbBranches = ["Thanh", "Thiếu", "Đồng"];

  const categories = await prisma.gradeCategory.findMany({ where: { active: true } });
  const totalQuarterActivities = await prisma.activity.count({
    where: { year: dateRange.year, quarter: dateRange.quarter },
  });

  const allActiveMembers = await prisma.member.findMany({ where: { active: true } });

  // Resolve historical branch at quarter end for all members
  const memberBranchMap = {};
  for (const m of allActiveMembers) {
    const histBranch = await getMemberBranchAtQuarterEnd(m.id, dateRange.year, dateRange.quarter);
    memberBranchMap[m.id] = normalizeDbBranch(histBranch || m.branch) || "Chưa phân ngành";
  }

  const branchDataPromises = dbBranches.map(async (rawBranch) => {
    const branchMembers = allActiveMembers.filter((m) => memberBranchMap[m.id] === rawBranch);
    const memberIds = branchMembers.map((m) => m.id);

    const [sessions, attendances, grades, activities] = await Promise.all([
      prisma.session.findMany({ where: { branch: rawBranch, date: { gte: dateRange.startDate, lte: dateRange.endDate } } }),
      prisma.attendance.findMany({
        where: {
          date: { gte: dateRange.startDate, lte: dateRange.endDate },
          memberId: { in: memberIds },
        },
      }),
      prisma.grade.findMany({
        where: {
          year: dateRange.year,
          quarter: dateRange.quarter,
          memberId: { in: memberIds },
        },
        include: { category: true },
      }),
      prisma.activityAttendance.findMany({
        where: {
          activity: { year: dateRange.year, quarter: dateRange.quarter },
          memberId: { in: memberIds },
        },
      }),
    ]);

    const totalMembers = branchMembers.length;
    const totalSessions = sessions.length || 1;
    const totalPotentialVisits = totalMembers * totalSessions;

    const absentEq = attendances.reduce((acc, a) => {
      if (a.status === "absent") return acc + 1;
      if (a.status === "late") return acc + 0.5;
      if (a.status === "excused") return acc + 0.2;
      return acc;
    }, 0);

    const presentEq = Math.max(0, totalPotentialVisits - absentEq);
    const attendanceRate = totalPotentialVisits > 0 ? Number(((presentEq / totalPotentialVisits) * 100).toFixed(1)) : 0;

    // Average Score
    const memberScoresMap = {};
    for (const g of grades) {
      if (!memberScoresMap[g.memberId]) memberScoresMap[g.memberId] = {};
      memberScoresMap[g.memberId][g.category.name] = g.score;
    }
    const scoreValues = Object.values(memberScoresMap).map((scores) => calculateTotalScoreDynamic(scores, categories));
    const averageScore = scoreValues.length > 0 ? Number((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(1)) : 0;

    // Activity Rate
    const maxJoins = totalMembers * (totalQuarterActivities || 1);
    const joined = activities.length;
    const activityRate = maxJoins > 0 ? Number(((joined / maxJoins) * 100).toFixed(1)) : 0;

    // Risk members for branch
    const riskMembers = branchMembers.filter((m) => {
      const mAtts = attendances.filter((a) => a.memberId === m.id && (a.status === "absent" || a.status === "late"));
      const mGrades = memberScoresMap[m.id];
      const mAvgScore = mGrades ? calculateTotalScoreDynamic(mGrades, categories) : null;
      return mAtts.length >= 3 || (mAvgScore !== null && mAvgScore < 6.5);
    }).length;

    // Branch Health Score calculation
    const scoreScaled = (averageScore / 10) * 100;
    const riskFactor = Math.max(0, 100 - (totalMembers > 0 ? (riskMembers / totalMembers) * 100 * 3 : 0));
    const healthScore = Math.round(attendanceRate * 0.35 + scoreScaled * 0.3 + activityRate * 0.2 + riskFactor * 0.15);

    const levelMap = { Thanh: 3, Thiếu: 2, Đồng: 1 };

    return {
      rawBranch,
      branchName: getDisplayBranchName(rawBranch),
      level: levelMap[rawBranch] || 1,
      totalMembers,
      attendanceRate,
      averageScore,
      activityRate,
      riskCount: riskMembers,
      healthScore,
    };
  });

  const branchResults = await Promise.all(branchDataPromises);

  branchResults.sort((a, b) => b.healthScore - a.healthScore);
  const medals = ["🥇", "🥈", "🥉"];

  return branchResults.map((item, index) => ({
    ...item,
    rank: index + 1,
    medal: medals[index] || "",
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TOP MEMBERS LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────
async function getExecutiveTopMembers(
  user,
  { year, quarter, branch, sortBy = "score", limit = 100 }
) {
  const dateRange = getQuarterDateRanges(year, quarter);
  const branchFilter = getEffectiveBranchFilter(user, branch);

  // Fetch active members without strict SQL branch filter so historical branch matches are caught
  const members = await prisma.member.findMany({
    where: {
      active: true,
    },
    include: {
      attendances: {
        where: {
          date: {
            gte: dateRange.startDate,
            lte: dateRange.endDate,
          },
        },
      },
      grades: {
        where: {
          year: dateRange.year,
          quarter: dateRange.quarter,
        },
        include: {
          category: true,
        },
      },
      activityAttendances: {
        where: {
          activity: {
            year: dateRange.year,
            quarter: dateRange.quarter,
          },
        },
        include: {
          activity: true,
        },
      },
    },
  });

  const categories = await prisma.gradeCategory.findMany({
    where: {
      active: true,
    },
  });

  const totalQuarterSessions = await prisma.session.count({
    where: {
      date: {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      },
    },
  });

  const totalQuarterActivities = await prisma.activity.count({
    where: {
      year: dateRange.year,
      quarter: dateRange.quarter,
    },
  });

  const requestedNormBranch = branchFilter.branch ? normalizeDbBranch(branchFilter.branch) : null;

  const memberDataPromises = members.map(async (m) => {
    // ✅ QUAN TRỌNG: Lấy ngành lịch sử của Đoàn sinh tại thời điểm chốt Quý
    const historicalBranch = await getMemberBranchAtQuarterEnd(
      m.id,
      dateRange.year,
      dateRange.quarter
    );
    const effectiveBranch = historicalBranch || m.branch || "Chưa phân ngành";
    const normEffective = normalizeDbBranch(effectiveBranch);

    // Lọc theo ngành được yêu cầu nếu có
    if (requestedNormBranch && normEffective !== requestedNormBranch) {
      return null;
    }

    const absent = m.attendances.filter((a) => a.status === "absent").length;
    const late = m.attendances.filter((a) => a.status === "late").length;
    const excused = m.attendances.filter((a) => a.status === "excused").length;

    const absentEq = absent * 1 + late * 0.5 + excused * 0.2;
    const mSessions = totalQuarterSessions || 1;

    const attendanceRate = Number(
      (Math.max(0, (mSessions - absentEq) / mSessions) * 100).toFixed(1)
    );

    const scores = {};
    for (const g of m.grades) {
      scores[g.category.name] = g.score;
    }

    const baseScore = Number(
      calculateTotalScoreDynamic(scores, categories).toFixed(1)
    );

    const joinedAct = m.activityAttendances.length;
    const activityScore = Math.min(joinedAct * 0.2, 10);
    const totalScore = Number((baseScore + activityScore).toFixed(1));

    const mActs = totalQuarterActivities || 1;
    const activityRate = Number(((joinedAct / mActs) * 100).toFixed(1));

    return {
      id: m.id,
      name: m.name,
      parish: m.parish || "",
      branch: getDisplayBranchName(effectiveBranch),
      totalScore,
      score: totalScore,
      attendanceRate,
      activityRate,
      rankText: getRank(totalScore),
    };
  });

  let memberList = (await Promise.all(memberDataPromises)).filter(Boolean);

  memberList.sort((a, b) => {
    if (sortBy === "attendance") {
      return b.attendanceRate - a.attendanceRate;
    }

    if (sortBy === "activity") {
      return b.activityRate - a.activityRate;
    }

    return b.totalScore - a.totalScore;
  });

  const medals = ["🥇", "🥈", "🥉"];

  return memberList
    .slice(0, Number(limit) || 100)
    .map((m, idx) => ({
      ...m,
      rank: idx + 1,
      medal: medals[idx] || `${idx + 1}`,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ATTENDANCE TREND (TIMELINE BY SESSIONS/WEEKS)
// ─────────────────────────────────────────────────────────────────────────────
async function getExecutiveAttendanceTrend(user, { year, quarter, branch }) {
  const dateRange = getQuarterDateRanges(year, quarter);
  const branchFilter = getEffectiveBranchFilter(user, branch);

  let sessions = await prisma.session.findMany({
    where: { date: { gte: dateRange.startDate, lte: dateRange.endDate } },
    orderBy: { date: "asc" },
  });

  // Fallback: If no Session records, check Attendance dates in quarter
  if (sessions.length === 0) {
    const distinctAtts = await prisma.attendance.findMany({
      where: { date: { gte: dateRange.startDate, lte: dateRange.endDate } },
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "asc" },
    });
    sessions = distinctAtts.map((a, idx) => ({ id: idx + 1, date: a.date }));
  }

  const dbBranches = ["Thanh", "Thiếu", "Đồng"];

  const trendPointsPromises = sessions.map(async (s, index) => {
    const sessionDate = s.date;
    const label = `Buổi ${index + 1} (${sessionDate.getDate()}/${sessionDate.getMonth() + 1})`;

    const allMembers = await prisma.member.findMany({
      where: { active: true, ...branchFilter },
      select: { id: true, branch: true },
    });

    const attendances = await prisma.attendance.findMany({
      where: { date: sessionDate, member: { active: true, ...branchFilter } },
    });

    const attMap = new Map(attendances.map((a) => [a.memberId, a.status]));

    const calcRate = (mList) => {
      if (mList.length === 0) return 100;
      let absentEq = 0;
      for (const m of mList) {
        const st = attMap.get(m.id);
        if (st === "absent") absentEq += 1;
        else if (st === "late") absentEq += 0.5;
        else if (st === "excused") absentEq += 0.2;
      }
      return Number(((Math.max(0, mList.length - absentEq) / mList.length) * 100).toFixed(1));
    };

    const point = {
      date: sessionDate,
      label,
      all: calcRate(allMembers),
    };

    for (const b of dbBranches) {
      const bMembers = allMembers.filter((m) => m.branch === b);
      const displayKey = getDisplayBranchName(b);
      point[displayKey] = calcRate(bMembers);
    }

    return point;
  });

  return Promise.all(trendPointsPromises);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ACTIVITY PARTICIPATION
// ─────────────────────────────────────────────────────────────────────────────
async function getExecutiveActivities(user, { year, quarter, branch }) {
  const dateRange = getQuarterDateRanges(year, quarter);
  const branchFilter = getEffectiveBranchFilter(user, branch);

  const activities = await prisma.activity.findMany({
    where: { year: dateRange.year, quarter: dateRange.quarter },
    include: {
      attendances: {
        where: { member: { active: true, ...branchFilter } },
        include: { member: true },
      },
    },
    orderBy: { date: "asc" },
  });

  const totalMembers = await prisma.member.count({
    where: { active: true, ...branchFilter },
  });

  return activities.map((act) => {
    const joinedCount = act.attendances.length;
    const rate = totalMembers > 0 ? Number(((joinedCount / totalMembers) * 100).toFixed(1)) : 0;

    return {
      id: act.id,
      name: act.name,
      date: act.date,
      joinedCount,
      totalMembers,
      participationRate: rate,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. EXECUTIVE RISK CENTER
// ─────────────────────────────────────────────────────────────────────────────
async function getExecutiveRiskMembers(user, { year, quarter, branch }) {
  const dateRange = getQuarterDateRanges(year, quarter);
  const branchFilter = getEffectiveBranchFilter(user, branch);

  const sixMonthsAgo = new Date(dateRange.endDate);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const members = await prisma.member.findMany({
    where: {
      active: true,
      ...branchFilter,
    },
    include: {
      attendances: {
        where: {
          date: {
            gte: sixMonthsAgo,
            lte: dateRange.endDate,
          },
        },
        select: {
          status: true,
        },
      },
      grades: {
        where: {
          year: dateRange.year,
          quarter: dateRange.quarter,
        },
        include: {
          category: true,
        },
      },
    },
  });

  const categories = await prisma.gradeCategory.findMany({
    where: {
      active: true,
    },
  });

  const memberDataPromises = members.map(async (member) => {
    const scoresMap = {};
    for (const grade of member.grades) {
      scoresMap[grade.category.name] = grade.score;
    }

    const scoredCategories = Object.keys(scoresMap);

    let averageGrade = null;
    if (scoredCategories.length > 0) {
      averageGrade = calculateTotalScoreDynamic(scoresMap, categories);
    }

    const attendanceEquivalent = member.attendances.reduce(
      (total, attendance) => {
        switch (attendance.status) {
          case "absent":  return total + 1;
          case "late":    return total + 0.5;
          case "excused": return total + 0.2;
          default:        return total;
        }
      },
      0
    );

    const absentCount  = member.attendances.filter((a) => a.status === "absent").length;
    const lateCount    = member.attendances.filter((a) => a.status === "late").length;
    const excusedCount = member.attendances.filter((a) => a.status === "excused").length;

    // ✅ Resolve ngành lịch sử tại thời điểm chốt quý
    const resolvedBranch = await getMemberBranchAtQuarterEnd(
      member.id,
      dateRange.year,
      dateRange.quarter
    );

    return {
      member,
      branch: resolvedBranch || member.branch || "UNKNOWN",
      averageGrade,
      scoredCategoryCount: scoredCategories.length,
      attendanceEquivalent,
      absentCount,
      lateCount,
      excusedCount,
    };
  });

  const memberData = await Promise.all(memberDataPromises);

  const branchScoreGroups = {};

  for (const data of memberData) {
    if (data.averageGrade === null) continue;

    const branchKey = data.branch;
    if (!branchScoreGroups[branchKey]) {
      branchScoreGroups[branchKey] = [];
    }
    branchScoreGroups[branchKey].push(data.averageGrade);
  }

  const branchAverageMap = {};
  for (const [branchKey, scores] of Object.entries(branchScoreGroups)) {
    if (scores.length === 0) continue;
    const total = scores.reduce((sum, score) => sum + score, 0);
    branchAverageMap[branchKey] = total / scores.length;
  }

  const riskMembers = [];

  for (const data of memberData) {
    const {
      member,
      branch: branchKey,
      averageGrade,
      scoredCategoryCount,
      attendanceEquivalent,
      absentCount,
      lateCount,
      excusedCount,
    } = data;

    let attendanceRisk = 0;
    if (attendanceEquivalent >= 6)      attendanceRisk = 65;
    else if (attendanceEquivalent >= 5) attendanceRisk = 55;
    else if (attendanceEquivalent >= 4) attendanceRisk = 40;
    else if (attendanceEquivalent >= 3) attendanceRisk = 25;
    else if (attendanceEquivalent >= 2) attendanceRisk = 10;

    let gradeRisk = 0;
    let branchAverageGrade = null;
    let gradeDifference = null;

    if (averageGrade !== null) {
      branchAverageGrade = branchAverageMap[branchKey] ?? null;

      if (branchAverageGrade !== null) {
        gradeDifference = branchAverageGrade - averageGrade;

        if (gradeDifference >= 1.5)      gradeRisk = 30;
        else if (gradeDifference >= 1)   gradeRisk = 20;
        else if (gradeDifference >= 0.5) gradeRisk = 10;
      }
    }

    const riskScore = Math.min(100, attendanceRisk + gradeRisk);

    if (riskScore < 30) continue;

    let riskLevel = "medium";
    if (riskScore >= 60) riskLevel = "high";

    const reasons = [];

    if (attendanceEquivalent >= 2) {
      reasons.push(
        `Vắng/trễ quy đổi ${attendanceEquivalent.toFixed(1)} buổi trong 6 tháng gần nhất`
      );
    }

    if (gradeDifference !== null && gradeDifference >= 0.5) {
      reasons.push(
        `Điểm thấp hơn trung bình Ngành ${gradeDifference.toFixed(1)} điểm`
      );
    }

    riskMembers.push({
      id: member.id,
      fullName: member.name,
      parish: member.parish || "",
      branch: getDisplayBranchName(branchKey || "Chưa phân ngành"),

      riskScore,
      riskLevel,

      absentCount,
      lateCount,
      excusedCount,
      attendanceEquivalent: Number(attendanceEquivalent.toFixed(1)),

      averageGrade:       averageGrade !== null       ? Number(averageGrade.toFixed(1))       : null,
      branchAverageGrade: branchAverageGrade !== null ? Number(branchAverageGrade.toFixed(1)) : null,
      gradeDifference:    gradeDifference !== null    ? Number(gradeDifference.toFixed(1))    : null,

      scoredCategoryCount,
      reasons,
    });
  }

  riskMembers.sort((a, b) => b.riskScore - a.riskScore);

  return riskMembers;
}

module.exports = {
  getExecutiveOverview,
  getExecutiveBranchPerformance,
  getExecutiveTopMembers,
  getExecutiveAttendanceTrend,
  getExecutiveActivities,
  getExecutiveRiskMembers,
};
