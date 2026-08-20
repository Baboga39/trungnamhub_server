const prisma = require("../libs/prisma");
const {
  calculateTotalScoreDynamic,
  getRank,
} = require("../libs/scoreCalculator");
const { buildBranchFilter } = require("./member.service");

async function getAllGrades(user) {
  const branchFilter = buildBranchFilter(user);

  const grades = await prisma.grade.findMany({
    where: { mMember: { ...branchFilter } },
    include: {
      mMember: true,
      category: true,
    },
  });

  const activities = await prisma.activityAttendance.findMany({
    where: { member: { ...branchFilter } },
    include: {
      activity: true,
    },
  });

  // map activity score theo member + quarter + year
  const activityMap = new Map();

  for (const a of activities) {
    const key = `${a.memberId}_${a.activity.year}_${a.activity.quarter}`;

    const current = activityMap.get(key) || {
      count: 0,
      score: 0,
    };

    current.count += 1;
    current.score = Math.min(current.score + 0.2, 10);
    activityMap.set(key, current);
  }

  // group grades
  const grouped = {};

  for (const g of grades) {
    const key = `${g.memberId}_${g.year}_${g.quarter}`;

    if (!grouped[key]) {
      const activity = activityMap.get(key) || { count: 0, score: 0 };

      grouped[key] = {
        memberId: g.memberId,
        year: g.year,
        quarter: g.quarter,
        mMember: g.mMember,

        scores: {},
        activityCount: activity.count,
        activityScore: activity.score,
      };
    }

    const catKey = g.category.name.toLowerCase().replace(/\s+/g, "_");

    grouped[key].scores[catKey] = g.score;
  }

  return Object.values(grouped);
}

function buildActivityMap(activities, groupByQuarter = true) {
  const map = new Map();

  for (const a of activities) {
    const key = groupByQuarter
      ? `${a.memberId}_${a.activity.year}_${a.activity.quarter}`
      : `${a.memberId}`;

    const current = map.get(key) || {
      count: 0,
      score: 0,
    };

    current.count += 1;
    current.score = Math.min(current.score + 0.2, 10);

    map.set(key, current);
  }

  return map;
}

async function upSertGradeCategory(data, user) {
  return prisma.gradeCategory.upsert({
    where: { id: data.id || 0 },
    update: { ...data, createdById: user.userId },
    create: { ...data, createdById: user.userId },
  });
}

async function softDeleteGradeCategory(id) {
  return prisma.grade.update({
    where: { id },
    data: { active: false },
  });
}
async function getAllGradeCategory() {
  return prisma.gradeCategory.findMany({
    where: { active: true },
  });
}

async function upSertScore(data) {
  const { memberId, year, quarter, scores } = data;

  if (!scores || !Array.isArray(scores)) {
    throw new Error("scores must be an array");
  }

  return prisma.$transaction(
    scores.map((s) =>
      prisma.grade.upsert({
        where: {
          memberId_categoryId_year_quarter: {
            memberId: Number(memberId),
            categoryId: Number(s.categoryId),
            year: Number(year),
            quarter: Number(quarter),
          },
        },
        update: {
          score: Number(s.score),
        },
        create: {
          memberId: Number(memberId),
          categoryId: Number(s.categoryId),
          year: Number(year),
          quarter: Number(quarter),
          score: Number(s.score),
        },
      }),
    ),
  );
}
function getQuarter(date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

function getCurrentEvaluationQuarters() {
  const month = new Date().getMonth() + 1;

  if (month <= 6) {
    return [1, 2];
  }

  return [1, 2, 3, 4];
}

async function updateAttendanceScore(memberId, year, quarter) {
  const startMonth = (quarter - 1) * 3;
  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, startMonth + 3, 0);

  // Lấy thông tin ngành của member
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { branch: true },
  });

  let totalSessions = 0;
  if (member?.branch) {
    totalSessions = await prisma.session.count({
      where: {
        branch: member.branch,
        date: { gte: startDate, lte: endDate },
      },
    });
  }

  // Fallback nếu ngành chưa tạo session riêng hoặc member chưa có ngành
  if (totalSessions === 0) {
    totalSessions = await prisma.session.count({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
  }

  if (totalSessions === 0) return;

  // chỉ lấy record vắng/trễ/có phép
  const attendances = await prisma.attendance.findMany({
    where: {
      memberId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: { status: true },
  });

  let absentEquivalent = 0;

  for (const a of attendances) {
    switch (a.status) {
      case "absent":
        absentEquivalent += 1;
        break;
      case "late":
        absentEquivalent += 0.5;
        break;
      case "excused":
        absentEquivalent += 0.2;
        break;
    }
  }

  const presentEquivalent = totalSessions - absentEquivalent;

  const score = Number(((presentEquivalent / totalSessions) * 10).toFixed(1));

  const category = await prisma.gradeCategory.findFirst({
    where: { name: "Chuyên cần", active: true },
  });

  if (!category) return;

  await prisma.grade.upsert({
    where: {
      memberId_categoryId_year_quarter: {
        memberId,
        categoryId: category.id,
        year,
        quarter,
      },
    },
    update: { score },
    create: {
      memberId,
      categoryId: category.id,
      year,
      quarter,
      score,
    },
  });
}

async function recalculateAllAttendanceScores(date) {
  const members = await prisma.member.findMany({
    where: { active: true },
    select: { id: true },
  });

  const year = date.getFullYear();
  const quarter = getQuarter(date);

  await Promise.all(
    members.map((m) => updateAttendanceScore(m.id, year, quarter)),
  );
}

async function getTop3MembersByScoreThisYear(user, queryQuarter, queryYear) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);
  const quarter = queryQuarter ? Number(queryQuarter) : currentQuarter;
  const year = queryYear ? Number(queryYear) : now.getFullYear();
  const branchFilter = buildBranchFilter(user);

  // Lấy điểm các category của quý được chọn
  const grades = await prisma.grade.findMany({
    where: {
      year,
      quarter,
      mMember: { ...branchFilter },
    },
    include: {
      category: true,
      mMember: true,
    },
  });

  // Lấy điểm hoạt động trong quý được chọn
  const activities = await prisma.activityAttendance.findMany({
    where: {
      activity: {
        year,
        quarter,
      },
      member: { ...branchFilter },
    },
    include: {
      activity: true,
    },
  });

  // Map activity score theo member
  const activityMap = new Map();
  for (const a of activities) {
    const current = activityMap.get(a.memberId) || { count: 0, score: 0 };
    current.count += 1;
    current.score = Math.min(current.score + 0.2, 10);
    activityMap.set(a.memberId, current);
  }

  const categories = await prisma.gradeCategory.findMany({
    where: { active: true },
  });

  // Gom điểm theo từng đoàn sinh cho quý này
  const memberGradeMap = new Map();
  for (const g of grades) {
    if (!memberGradeMap.has(g.memberId)) {
      memberGradeMap.set(g.memberId, {
        member: g.mMember,
        scores: {},
      });
    }

    const mData = memberGradeMap.get(g.memberId);
    const catName = g.category.name.trim();
    mData.scores[catName] = g.score;
  }

  // Tính điểm tổng quý cho từng đoàn sinh
  const result = Array.from(memberGradeMap.entries()).map(([memberId, data]) => {
    const act = activityMap.get(memberId) || { score: 0 };
    const baseScore = calculateTotalScoreDynamic(data.scores, categories);
    const totalScore = Number((baseScore + act.score).toFixed(1));

    return {
      memberId,
      totalScore,
      rank: getRank(totalScore),
      member: data.member,
      quarter,
      year,
    };
  });

  return result.sort((a, b) => b.totalScore - a.totalScore).slice(0, 3);
}


async function getRankingThisYear(user) {
  const quarters = getCurrentEvaluationQuarters();
  const currentYear = new Date().getFullYear();
  const branchFilter = buildBranchFilter(user);

  const grades = await prisma.grade.findMany({
    where: {
      year: currentYear,
      quarter: { in: quarters },
      mMember: { ...branchFilter },
    },
    include: {
      mMember: true,
      category: true,
    },
  });

  const activities = await prisma.activityAttendance.findMany({
    where: {
      activity: {
        year: currentYear,
        quarter: { in: quarters },
      },
    },
    include: {
      activity: true,
    },
  });

  const activityMap = new Map();
  for (const a of activities) {
    const key = `${a.memberId}_${a.activity.year}_${a.activity.quarter}`;
    const current = activityMap.get(key) || { count: 0, score: 0 };
    current.count += 1;
    current.score = Math.min(current.score + 0.2, 10);
    activityMap.set(key, current);
  }

  const categories = await prisma.gradeCategory.findMany({
    where: { active: true },
  });

  const memberQuarterMap = new Map();
  for (const g of grades) {
    if (!memberQuarterMap.has(g.memberId)) {
      memberQuarterMap.set(g.memberId, {
        member: g.mMember,
        quarters: {},
      });
    }

    const mData = memberQuarterMap.get(g.memberId);
    if (!mData.quarters[g.quarter]) {
      mData.quarters[g.quarter] = {};
    }

    const catName = g.category.name.trim();
    mData.quarters[g.quarter][catName] = g.score;
  }

  const ranking = Array.from(memberQuarterMap.entries()).map(([memberId, data]) => {
    const quarterScores = [];
    const sortedQuarterNums = Object.keys(data.quarters)
      .map(Number)
      .sort((a, b) => a - b);

    for (const qNum of sortedQuarterNums) {
      const scoresObj = data.quarters[qNum];
      const actKey = `${memberId}_${currentYear}_${qNum}`;
      const act = activityMap.get(actKey) || { score: 0 };

      const baseScore = calculateTotalScoreDynamic(scoresObj, categories);
      const qTotal = baseScore + act.score;
      quarterScores.push(qTotal);
    }

    const avgScore =
      quarterScores.length > 0
        ? Number((quarterScores.reduce((sum, s) => sum + s, 0) / quarterScores.length).toFixed(1))
        : 0;

    let trend = "same";
    if (quarterScores.length >= 2) {
      const latest = quarterScores[quarterScores.length - 1];
      const prev = quarterScores[quarterScores.length - 2];
      if (latest > prev) trend = "up";
      else if (latest < prev) trend = "down";
    }

    return {
      memberId,
      memberName: data.member.name,
      holyName: data.member.holyName,
      totalScore: avgScore,
      trend,
      rankText: getRank(avgScore),
    };
  });

  return ranking
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 10)
    .map((r, index) => ({
      ...r,
      rank: index + 1,
    }));
}
async function getGradeTrendTimeline(user) {
  const currentYear = new Date().getFullYear();
  const branchFilter = buildBranchFilter(user);

  // Lấy toàn bộ grade trong năm, lọc theo branch
  const grades = await prisma.grade.findMany({
    where: {
      year: currentYear,
      mMember: { ...branchFilter },
    },
    select: {
      score: true,
      createdAt: true,
    },
  });

  // Gom theo tháng
  const monthMap = {};

  for (const g of grades) {
    const month = g.createdAt.getMonth() + 1; // 1 -> 12

    if (!monthMap[month]) {
      monthMap[month] = {
        month: `Tháng ${month}`,
        scores: [],
      };
    }

    monthMap[month].scores.push(g.score);
  }

  // Tính avg / max / min cho từng tháng
  const result = Object.values(monthMap).map((m) => {
    const avg = m.scores.reduce((a, b) => a + b, 0) / m.scores.length;

    return {
      month: m.month,
      average: Number(avg.toFixed(1)),
      max: Number(Math.max(...m.scores).toFixed(1)),
      min: Number(Math.min(...m.scores).toFixed(1)),
    };
  });

  // sort theo tháng tăng dần
  return result.sort((a, b) => {
    const ma = parseInt(a.month.replace("Tháng ", ""));
    const mb = parseInt(b.month.replace("Tháng ", ""));
    return ma - mb;
  });
}

async function deleteScore({ memberId, year, quarter }) {
  if (!memberId || !year || !quarter) {
    throw { statusCode: 400, message: "Missing memberId, year, or quarter" };
  }

  const result = await prisma.grade.deleteMany({
    where: {
      memberId: Number(memberId),
      year: Number(year),
      quarter: Number(quarter),
    },
  });

  return result;
}

module.exports = {
  getAllGrades,
  upSertGradeCategory,
  softDeleteGradeCategory,
  getAllGradeCategory,
  upSertScore,
  deleteScore,
  updateAttendanceScore,
  getTop3MembersByScoreThisYear,
  getRankingThisYear,
  getGradeTrendTimeline,
  recalculateAllAttendanceScores,
  buildActivityMap,
};
