// src/services/executiveDashboardService.js
const prisma = require("../libs/prisma");
const { calculateTotalScoreDynamic, getRank } = require("../libs/scoreCalculator");
const { buildBranchFilter } = require("./member.service");

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const DB_BRANCHES = ["Thanh", "Thiếu", "Đồng"];
const BRANCH_LEVEL_MAP = { Thanh: 3, Thiếu: 2, Đồng: 1 };
const MEDALS = ["🥇", "🥈", "🥉"];

const ATTENDANCE_EQUIVALENTS = {
  absent: 1.0,
  late: 0.5,
  excused: 0.2,
};

const HEALTH_SCORE_WEIGHTS = {
  attendance: 0.35,
  score: 0.30,
  activity: 0.20,
  risk: 0.15,
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS & UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

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
  const q = Number(quarter) || Math.floor(new Date().getMonth() / 3) + 1;

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
  if (!user) return true;
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

/**
 * Calculates absent equivalent weight: absent=1, late=0.5, excused=0.2
 */
function calcAbsentEquivalent(attendances) {
  if (!attendances || !attendances.length) return 0;
  return attendances.reduce((acc, a) => {
    const status = typeof a === "string" ? a : a?.status;
    return acc + (ATTENDANCE_EQUIVALENTS[status] || 0);
  }, 0);
}

/**
 * Fetches sessions for a date range with fallback to distinct attendance dates if no sessions exist.
 */
async function getEffectiveQuarterSessions(startDate, endDate, branch = null) {
  const sessionWhere = {
    date: { gte: startDate, lte: endDate },
  };
  if (branch) {
    sessionWhere.branch = branch;
  }

  let sessions = await prisma.session.findMany({
    where: sessionWhere,
    select: { id: true, date: true, branch: true },
    orderBy: { date: "asc" },
  });

  if (sessions.length === 0) {
    const attWhere = {
      date: { gte: startDate, lte: endDate },
    };
    if (branch) {
      attWhere.member = { branch };
    }

    const distinctAtts = await prisma.attendance.findMany({
      where: attWhere,
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "asc" },
    });

    sessions = distinctAtts.map((a, idx) => ({ id: idx + 1, date: a.date, branch }));
  }

  return sessions;
}

/**
 * Batch resolves historical branch at quarter end for an array of members in a SINGLE query.
 * Eliminates N+1 query problem.
 *
 * @param {Array<{ id: number, branch: string }>} members
 * @param {number} year
 * @param {number} quarter
 * @returns {Promise<Map<number, string>>} Map of memberId -> normalized branch ("Thanh", "Thiếu", "Đồng", ...)
 */
async function batchGetMemberBranchAtQuarterEnd(members, year, quarter) {
  if (!members || members.length === 0) return new Map();

  const startMonth = (quarter - 1) * 3;
  const quarterEndDate = new Date(year, startMonth + 3, 0, 23, 59, 59);
  const memberIds = members.map((m) => m.id);

  // Single batch query: find all promotions after quarterEndDate
  const futurePromotions = await prisma.memberStatusHistory.findMany({
    where: {
      memberId: { in: memberIds },
      type: "BRANCH_PROMOTED",
      date: { gt: quarterEndDate },
    },
    orderBy: { date: "asc" },
  });

  // Pick the earliest promotion after quarterEndDate per member
  const earliestPromotionMap = new Map();
  for (const p of futurePromotions) {
    if (!earliestPromotionMap.has(p.memberId)) {
      earliestPromotionMap.set(p.memberId, p);
    }
  }

  const resultMap = new Map();
  for (const m of members) {
    const p = earliestPromotionMap.get(m.id);
    let histBranch = m.branch;
    if (p) {
      if (p.fromBranch) {
        histBranch = p.fromBranch;
      } else if (p.toBranch) {
        const toNorm = p.toBranch.replace("Ngành ", "").trim();
        if (toNorm === "Thanh") histBranch = "Thiếu";
        else if (toNorm === "Thiếu") histBranch = "Đồng";
      }
    }
    const norm = normalizeDbBranch(histBranch) || "Chưa phân ngành";
    resultMap.set(m.id, norm);
  }

  return resultMap;
}

/**
 * Builds member scores map and calculates dynamic total scores.
 */
function buildMemberScoresMap(grades, categories) {
  const memberScoresMap = {};
  for (const g of grades) {
    if (!memberScoresMap[g.memberId]) memberScoresMap[g.memberId] = {};
    if (g.category && g.category.name) {
      memberScoresMap[g.memberId][g.category.name] = g.score;
    }
  }

  const memberTotalScoreMap = {};
  for (const [memberId, scores] of Object.entries(memberScoresMap)) {
    memberTotalScoreMap[memberId] = calculateTotalScoreDynamic(scores, categories);
  }

  return { memberScoresMap, memberTotalScoreMap };
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
    totalQuarterActivities,
    prevTotalQuarterActivities,
  ] = await Promise.all([
    prisma.member.count({ where: { active: true, ...branchFilter } }),
    // Historical member count prior to prev quarter end
    prisma.member.count({
      where: {
        createdAt: { lte: prevEndDate },
        ...branchFilter,
      },
    }),

    // Attendance records in current quarter
    prisma.attendance.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        member: { active: true, ...branchFilter },
      },
      select: { status: true, memberId: true },
    }),
    // Attendance records in previous quarter
    prisma.attendance.findMany({
      where: {
        date: { gte: prevStartDate, lte: prevEndDate },
        member: { active: true, ...branchFilter },
      },
      select: { status: true, memberId: true },
    }),

    // Sessions count
    getEffectiveQuarterSessions(startDate, endDate, branchFilter.branch),
    getEffectiveQuarterSessions(prevStartDate, prevEndDate, branchFilter.branch),

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

    prisma.activity.count({
      where: { year: dateRange.year, quarter: dateRange.quarter },
    }),
    prisma.activity.count({
      where: { year: dateRange.prevYear, quarter: dateRange.prevQuarter },
    }),
  ]);

  // Attendance rate calculation
  const totalSessionsCount = sessions.length || 1;
  const prevTotalSessionsCount = prevSessions.length || 1;

  const totalPotentialVisits = totalMembers * totalSessionsCount;
  const prevTotalPotentialVisits = prevTotalMembers * prevTotalSessionsCount;

  const absentEq = calcAbsentEquivalent(attendances);
  const prevAbsentEq = calcAbsentEquivalent(prevAttendances);

  const presentEq = Math.max(0, totalPotentialVisits - absentEq);
  const prevPresentEq = Math.max(0, prevTotalPotentialVisits - prevAbsentEq);

  const attendanceRate =
    totalPotentialVisits > 0 ? Number(((presentEq / totalPotentialVisits) * 100).toFixed(1)) : 0;
  const prevAttendanceRate =
    prevTotalPotentialVisits > 0
      ? Number(((prevPresentEq / prevTotalPotentialVisits) * 100).toFixed(1))
      : 0;

  // Average Score calculation
  const { memberTotalScoreMap } = buildMemberScoresMap(grades, categories);
  const scoreValues = Object.values(memberTotalScoreMap);
  const avgScore =
    scoreValues.length > 0
      ? Number((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(1))
      : 0;

  const { memberTotalScoreMap: prevMemberTotalScoreMap } = buildMemberScoresMap(
    prevGrades,
    categories
  );
  const prevScoreValues = Object.values(prevMemberTotalScoreMap);
  const prevAvgScore =
    prevScoreValues.length > 0
      ? Number((prevScoreValues.reduce((a, b) => a + b, 0) / prevScoreValues.length).toFixed(1))
      : 0;

  // Activity participation rate
  const maxPossibleActivityJoins = totalMembers * (totalQuarterActivities || 1);
  const joinedActivityCount = activities.length;
  const activityRate =
    maxPossibleActivityJoins > 0
      ? Number(((joinedActivityCount / maxPossibleActivityJoins) * 100).toFixed(1))
      : 0;

  const prevMaxPossibleActivityJoins = prevTotalMembers * (prevTotalQuarterActivities || 1);
  const prevJoinedActivityCount = prevActivities.length;
  const prevActivityRate =
    prevMaxPossibleActivityJoins > 0
      ? Number(((prevJoinedActivityCount / prevMaxPossibleActivityJoins) * 100).toFixed(1))
      : 0;

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

  const [categories, totalQuarterActivities, allActiveMembers] = await Promise.all([
    prisma.gradeCategory.findMany({ where: { active: true } }),
    prisma.activity.count({
      where: { year: dateRange.year, quarter: dateRange.quarter },
    }),
    prisma.member.findMany({ where: { active: true } }),
  ]);

  // Batch resolve historical branch at quarter end (1 query instead of N queries)
  const memberBranchMap = await batchGetMemberBranchAtQuarterEnd(
    allActiveMembers,
    dateRange.year,
    dateRange.quarter
  );

  const branchDataPromises = DB_BRANCHES.map(async (rawBranch) => {
    const branchMembers = allActiveMembers.filter(
      (m) => memberBranchMap.get(m.id) === rawBranch
    );
    const memberIds = branchMembers.map((m) => m.id);

    const [sessions, attendances, grades, activities] = await Promise.all([
      getEffectiveQuarterSessions(dateRange.startDate, dateRange.endDate, rawBranch),
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

    const absentEq = calcAbsentEquivalent(attendances);
    const presentEq = Math.max(0, totalPotentialVisits - absentEq);
    const attendanceRate =
      totalPotentialVisits > 0
        ? Number(((presentEq / totalPotentialVisits) * 100).toFixed(1))
        : 0;

    // Average Score
    const { memberTotalScoreMap } = buildMemberScoresMap(grades, categories);
    const scoreValues = Object.values(memberTotalScoreMap);
    const averageScore =
      scoreValues.length > 0
        ? Number((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(1))
        : 0;

    // Activity Rate
    const maxJoins = totalMembers * (totalQuarterActivities || 1);
    const joined = activities.length;
    const activityRate = maxJoins > 0 ? Number(((joined / maxJoins) * 100).toFixed(1)) : 0;

    // Risk members for branch
    const riskMembers = branchMembers.filter((m) => {
      const mAtts = attendances.filter(
        (a) => a.memberId === m.id && (a.status === "absent" || a.status === "late")
      );
      const mAvgScore = memberTotalScoreMap[m.id] ?? null;
      return mAtts.length >= 3 || (mAvgScore !== null && mAvgScore < 6.5);
    }).length;

    // Branch Health Score calculation
    const scoreScaled = (averageScore / 10) * 100;
    const riskFactor = Math.max(
      0,
      100 - (totalMembers > 0 ? (riskMembers / totalMembers) * 100 * 3 : 0)
    );
    const healthScore = Math.round(
      attendanceRate * HEALTH_SCORE_WEIGHTS.attendance +
        scoreScaled * HEALTH_SCORE_WEIGHTS.score +
        activityRate * HEALTH_SCORE_WEIGHTS.activity +
        riskFactor * HEALTH_SCORE_WEIGHTS.risk
    );

    return {
      rawBranch,
      branchName: getDisplayBranchName(rawBranch),
      level: BRANCH_LEVEL_MAP[rawBranch] || 1,
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

  return branchResults.map((item, index) => ({
    ...item,
    rank: index + 1,
    medal: MEDALS[index] || "",
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

  const [members, categories, sessions, totalQuarterActivities] = await Promise.all([
    prisma.member.findMany({
      where: { active: true },
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
    }),
    prisma.gradeCategory.findMany({ where: { active: true } }),
    getEffectiveQuarterSessions(dateRange.startDate, dateRange.endDate),
    prisma.activity.count({
      where: {
        year: dateRange.year,
        quarter: dateRange.quarter,
      },
    }),
  ]);

  // Batch resolve historical branch (1 query)
  const memberBranchMap = await batchGetMemberBranchAtQuarterEnd(
    members,
    dateRange.year,
    dateRange.quarter
  );

  const requestedNormBranch = branchFilter.branch
    ? normalizeDbBranch(branchFilter.branch)
    : null;

  const totalQuarterSessions = sessions.length || 1;
  const mActs = totalQuarterActivities || 1;

  const memberList = [];

  for (const m of members) {
    const effectiveBranch = memberBranchMap.get(m.id) || m.branch || "Chưa phân ngành";
    const normEffective = normalizeDbBranch(effectiveBranch);

    // Filter by requested branch if specified
    if (requestedNormBranch && normEffective !== requestedNormBranch) {
      continue;
    }

    const absentEq = calcAbsentEquivalent(m.attendances);
    const attendanceRate = Number(
      (Math.max(0, (totalQuarterSessions - absentEq) / totalQuarterSessions) * 100).toFixed(1)
    );

    const scores = {};
    for (const g of m.grades) {
      if (g.category && g.category.name) {
        scores[g.category.name] = g.score;
      }
    }

    const baseScore = Number(calculateTotalScoreDynamic(scores, categories).toFixed(1));
    const joinedAct = m.activityAttendances.length;
    const activityScore = Math.min(joinedAct * 0.2, 10);
    const totalScore = Number((baseScore + activityScore).toFixed(1));
    const activityRate = Number(((joinedAct / mActs) * 100).toFixed(1));

    memberList.push({
      id: m.id,
      name: m.name,
      parish: m.parish || "",
      branch: getDisplayBranchName(effectiveBranch),
      totalScore,
      score: totalScore,
      overallScore: totalScore,
      attendanceRate,
      activityRate,
      rankText: getRank(totalScore),
    });
  }

  const getSortVal = (m) => {
    if (sortBy === "attendance") return m.attendanceRate || 0;
    if (sortBy === "activity") return m.activityRate || 0;
    return m.totalScore || 0;
  };

  const sortFn = (a, b) => getSortVal(b) - getSortVal(a);

  let finalMembers = [];

  // When viewing ALL branches: Group by branch and take top 50% from each branch (inclusive of ties)
  if (!requestedNormBranch) {
    const branchGroups = {};
    for (const m of memberList) {
      const bKey = m.branch || "Khác";
      if (!branchGroups[bKey]) branchGroups[bKey] = [];
      branchGroups[bKey].push(m);
    }

    const topHalfCombined = [];
    for (const bKey in branchGroups) {
      const group = branchGroups[bKey];
      group.sort(sortFn);

      if (group.length > 0) {
        const halfCount = Math.ceil(group.length / 2);
        const cutoffMember = group[Math.min(halfCount - 1, group.length - 1)];
        const cutoffVal = getSortVal(cutoffMember);

        const topOfBranch = group.filter((m) => getSortVal(m) >= cutoffVal);
        topHalfCombined.push(...topOfBranch);
      }
    }

    topHalfCombined.sort(sortFn);
    finalMembers = topHalfCombined;
  } else {
    memberList.sort(sortFn);
    finalMembers = memberList;
  }

  return finalMembers
    .slice(0, Number(limit) || 100)
    .map((m, idx) => ({
      ...m,
      rank: idx + 1,
      medal: MEDALS[idx] || `${idx + 1}`,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ATTENDANCE TREND (TIMELINE BY SESSIONS/WEEKS)
// ─────────────────────────────────────────────────────────────────────────────
async function getExecutiveAttendanceTrend(user, { year, quarter, branch }) {
  const dateRange = getQuarterDateRanges(year, quarter);
  const branchFilter = getEffectiveBranchFilter(user, branch);

  const [sessions, allMembers, attendances] = await Promise.all([
    getEffectiveQuarterSessions(dateRange.startDate, dateRange.endDate, branchFilter.branch),
    prisma.member.findMany({
      where: { active: true, ...branchFilter },
      select: { id: true, branch: true },
    }),
    prisma.attendance.findMany({
      where: {
        date: { gte: dateRange.startDate, lte: dateRange.endDate },
        member: { active: true, ...branchFilter },
      },
      select: { date: true, memberId: true, status: true },
    }),
  ]);

  // Group attendances by ISO date string: Map<dateStr, Map<memberId, status>>
  const attByDate = new Map();
  for (const a of attendances) {
    const dKey = a.date.toISOString().split("T")[0];
    if (!attByDate.has(dKey)) {
      attByDate.set(dKey, new Map());
    }
    attByDate.get(dKey).set(a.memberId, a.status);
  }

  const calcRate = (mList, memberStatusMap) => {
    if (mList.length === 0) return 100;
    let absentEq = 0;
    for (const m of mList) {
      const st = memberStatusMap ? memberStatusMap.get(m.id) : null;
      if (st) {
        absentEq += ATTENDANCE_EQUIVALENTS[st] || 0;
      }
    }
    return Number(((Math.max(0, mList.length - absentEq) / mList.length) * 100).toFixed(1));
  };

  return sessions.map((s, index) => {
    const sessionDate = s.date;
    const dKey = sessionDate.toISOString().split("T")[0];
    const memberStatusMap = attByDate.get(dKey) || new Map();
    const label = `Buổi ${index + 1} (${sessionDate.getDate()}/${sessionDate.getMonth() + 1})`;

    const point = {
      date: sessionDate,
      label,
      all: calcRate(allMembers, memberStatusMap),
    };

    for (const b of DB_BRANCHES) {
      const bMembers = allMembers.filter((m) => m.branch === b);
      const displayKey = getDisplayBranchName(b);
      point[displayKey] = calcRate(bMembers, memberStatusMap);
    }

    return point;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ACTIVITY PARTICIPATION
// ─────────────────────────────────────────────────────────────────────────────
async function getExecutiveActivities(user, { year, quarter, branch }) {
  const dateRange = getQuarterDateRanges(year, quarter);
  const branchFilter = getEffectiveBranchFilter(user, branch);
  const requestedNormBranch = branchFilter.branch
    ? normalizeDbBranch(branchFilter.branch)
    : null;

  const [activities, allActiveMembers] = await Promise.all([
    prisma.activity.findMany({
      where: { year: dateRange.year, quarter: dateRange.quarter },
      include: {
        attendances: {
          where: { member: { active: true } },
          include: { member: true },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.member.findMany({ where: { active: true } }),
  ]);

  // Batch resolve historical branch
  const memberBranchMap = await batchGetMemberBranchAtQuarterEnd(
    allActiveMembers,
    dateRange.year,
    dateRange.quarter
  );

  const validMemberIds = new Set();
  allActiveMembers.forEach((m) => {
    const normB = memberBranchMap.get(m.id);
    if (!requestedNormBranch || normB === requestedNormBranch) {
      validMemberIds.add(m.id);
    }
  });

  const totalMembers = validMemberIds.size;

  return activities.map((act) => {
    const validAttendances = act.attendances.filter((att) =>
      validMemberIds.has(att.memberId)
    );
    const joinedCount = validAttendances.length;
    const rate =
      totalMembers > 0 ? Number(((joinedCount / totalMembers) * 100).toFixed(1)) : 0;

    let formattedDate = "";
    if (act.date) {
      const d = new Date(act.date);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      formattedDate = `${day}/${month}/${yyyy}`;
    }

    return {
      id: act.id,
      name: act.name,
      date: formattedDate || act.date,
      rawDate: act.date,
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

  const [members, categories] = await Promise.all([
    prisma.member.findMany({
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
    }),
    prisma.gradeCategory.findMany({ where: { active: true } }),
  ]);

  // Batch resolve historical branch (1 query)
  const memberBranchMap = await batchGetMemberBranchAtQuarterEnd(
    members,
    dateRange.year,
    dateRange.quarter
  );

  const memberData = members.map((member) => {
    const scoresMap = {};
    for (const grade of member.grades) {
      if (grade.category && grade.category.name) {
        scoresMap[grade.category.name] = grade.score;
      }
    }

    const scoredCategories = Object.keys(scoresMap);
    let averageGrade = null;
    if (scoredCategories.length > 0) {
      averageGrade = calculateTotalScoreDynamic(scoresMap, categories);
    }

    const attendanceEquivalent = calcAbsentEquivalent(member.attendances);
    const absentCount = member.attendances.filter((a) => a.status === "absent").length;
    const lateCount = member.attendances.filter((a) => a.status === "late").length;
    const excusedCount = member.attendances.filter((a) => a.status === "excused").length;

    const resolvedBranch = memberBranchMap.get(member.id) || member.branch || "UNKNOWN";

    return {
      member,
      branch: resolvedBranch,
      averageGrade,
      scoredCategoryCount: scoredCategories.length,
      attendanceEquivalent,
      absentCount,
      lateCount,
      excusedCount,
    };
  });

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
    if (attendanceEquivalent >= 6) attendanceRisk = 65;
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

        if (gradeDifference >= 1.5) gradeRisk = 30;
        else if (gradeDifference >= 1) gradeRisk = 20;
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
      reasons.push(`Điểm thấp hơn trung bình Ngành ${gradeDifference.toFixed(1)} điểm`);
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
      averageGrade: averageGrade !== null ? Number(averageGrade.toFixed(1)) : null,
      branchAverageGrade:
        branchAverageGrade !== null ? Number(branchAverageGrade.toFixed(1)) : null,
      gradeDifference: gradeDifference !== null ? Number(gradeDifference.toFixed(1)) : null,
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
