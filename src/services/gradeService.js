const prisma = require("../libs/prisma");
const {
  calculateTotalScoreDynamic,
  getRank,
} = require("../libs/scoreCalculator");

async function getAllGrades() {
  const grades = await prisma.grade.findMany({
    include: {
      mMember: true,
      category: true,
    },
  });

  const activities = await prisma.activityAttendance.findMany({
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

  // tổng số buổi sinh hoạt trong quý
  const totalSessions = await prisma.session.count({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

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

async function getTop3MembersByScoreThisYear() {
  const quarters = getCurrentEvaluationQuarters();
  const currentYear = new Date().getFullYear();

  // lấy điểm các category
  const grades = await prisma.grade.findMany({
    where: {
      year: currentYear,
      quarter: { in: quarters },
    },
    include: {
      category: true,
      mMember: true,
    },
  });

  // lấy điểm hoạt động
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

  // map activity score
  const activityMap = new Map();

  for (const a of activities) {
    const key = a.memberId;

    const current = activityMap.get(key) || { score: 0 };

    current.score = Math.min(current.score + 0.2, 10);

    activityMap.set(key, current);
  }

  const categories = await prisma.gradeCategory.findMany({
    where: { active: true },
  });

  const map = new Map();

  for (const g of grades) {
    if (!map.has(g.memberId)) {
      map.set(g.memberId, {
        member: g.mMember,
        formData: {},
      });
    }

    const item = map.get(g.memberId);

    const nameMap = {
      "Kiến thức": "knowledge",
      "Kỹ năng": "skill",
      "Chuyên cần": "attendance",
      Thưởng: "bonus",
      Phạt: "penalty",
    };

    const key = nameMap[g.category.name.trim()];
    item.formData[key] = g.score;
  }

  const result = Array.from(map.entries()).map(([memberId, data]) => {
    const activity = activityMap.get(memberId) || { score: 0 };

    const baseScore = calculateTotalScoreDynamic(data.formData, categories);

    const totalScore = baseScore + activity.score;
    return {
      memberId,
      totalScore,
      rank: getRank(totalScore),
      member: data.member,
    };
  });

  return result.sort((a, b) => b.totalScore - a.totalScore).slice(0, 3);
}

async function getRankingThisYear() {
  const quarters = getCurrentEvaluationQuarters();
  const currentYear = new Date().getFullYear();

  const grades = await prisma.grade.findMany({
    where: {
      year: currentYear,
      quarter: { in: quarters },
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
    const key = a.memberId;

    const current = activityMap.get(key) || { score: 0 };

    current.score = Math.min(current.score + 0.2, 10);

    activityMap.set(key, current);
  }

  const categories = await prisma.gradeCategory.findMany({
    where: { active: true },
  });

  const map = {};

  for (const g of grades) {
    if (!map[g.memberId]) {
      map[g.memberId] = {
        memberId: g.memberId,
        member: g.mMember,
        scores: {},
      };
    }

    map[g.memberId].scores[g.category.name] = g.score;
  }

  const ranking = Object.values(map).map((m) => {
    const activity = activityMap.get(m.memberId) || { score: 0 };

    const baseScore = calculateTotalScoreDynamic(
      {
        knowledge: m.scores["Kiến thức"],
        skill: m.scores["Kỹ năng"],
        attendance: m.scores["Chuyên cần"],
        bonus: m.scores["Thưởng"],
        penalty: m.scores["Phạt"],
      },
      categories,
    );

    const totalScore = baseScore + activity.score;

    return {
      memberId: m.memberId,
      memberName: m.member.name,
      holyName: m.member.holyName,
      totalScore,
      rankText: getRank(totalScore),
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
async function getGradeTrendTimeline() {
  const currentYear = new Date().getFullYear();

  // Lấy toàn bộ grade trong năm
  const grades = await prisma.grade.findMany({
    where: {
      year: currentYear,
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

module.exports = {
  getAllGrades,
  upSertGradeCategory,
  softDeleteGradeCategory,
  getAllGradeCategory,
  upSertScore,
  updateAttendanceScore,
  getTop3MembersByScoreThisYear,
  getRankingThisYear,
  getGradeTrendTimeline,
  recalculateAllAttendanceScores,
};
