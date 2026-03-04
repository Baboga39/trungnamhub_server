const prisma = require("../libs/prisma");
const {
  calculateTotalScoreDynamic,
  getRank,
} = require("../libs/scoreCalculator");

async function getAllGrades() {
  return prisma.grade.findMany({
    include: {
      mMember: true,
    },
  });
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
  const { memberId, scores } = data;

  if (!scores || !Array.isArray(scores)) {
    throw new Error("scores must be an array");
  }

  return await prisma.$transaction(
    scores.map((s) =>
      prisma.grade.upsert({
        where: {
          memberId_categoryId: {
            memberId: Number(memberId),
            categoryId: Number(s.categoryId),
          },
        },
        update: { score: Number(s.score) },
        create: {
          memberId: Number(memberId),
          categoryId: Number(s.categoryId),
          score: Number(s.score),
          createdAt: new Date(),
        },
      }),
    ),
  );
}
async function updateAttendanceScore(memberId) {
  const year = new Date().getFullYear();

  // lấy toàn bộ buổi trong năm
  const sessions = await prisma.session.findMany({
    where: {
      date: {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31),
      },
    },
    select: { id: true, date: true },
  });

  const totalSessions = sessions.length;
  if (totalSessions === 0) return 0;

  // lấy tất cả record điểm danh của member
  const attendances = await prisma.attendance.findMany({
    where: {
      memberId,
      date: {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31),
      },
    },
    select: { status: true },
  });

  // rule tính điểm
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
        absentEquivalent += 0;
        break;
      default:
        break;
    }
  }

  const presentEquivalent = totalSessions - absentEquivalent;

  const score = Number(((presentEquivalent / totalSessions) * 10).toFixed(2));

  const category = await prisma.gradeCategory.findFirst({
    where: { name: "Chuyên cần", active: true },
  });

  if (category) {
    await prisma.grade.upsert({
      where: {
        memberId_categoryId: {
          memberId,
          categoryId: category.id,
        },
      },
      update: { score },
      create: { memberId, categoryId: category.id, score },
    });
  }

  return score;
}
async function getTop3MembersByScoreThisYear() {
  const currentYear = new Date().getFullYear();

  // Lấy toàn bộ điểm trong năm + category + member
  const grades = await prisma.grade.findMany({
    where: { yearActive: currentYear },
    include: {
      category: true,
      mMember: true,
    },
  });

  // Lấy danh sách category để có weight
  const categories = await prisma.gradeCategory.findMany({
    where: { active: true },
  });

  // Gom điểm theo member
  const map = new Map();

  for (const g of grades) {
    if (!map.has(g.memberId)) {
      map.set(g.memberId, {
        member: g.mMember,
        formData: {},
      });
    }

    const item = map.get(g.memberId);

    // map điểm về đúng key giống formData
    const nameMap = {
      "Kiến thức": "knowledge",
      "Kỹ năng": "skill",
      "Chuyên cần": "attendance",
      Thưởng: "bonus",
      Phạt: "penalty",
    };

    const key = nameMap[g.category.name] || g.category.name;
    item.formData[key] = g.score;
  }

  // Tính tổng điểm động theo công thức chuẩn
  const result = Array.from(map.entries()).map(([memberId, data]) => {
    const totalScore = calculateTotalScoreDynamic(data.formData, categories);
    return {
      memberId,
      totalScore,
      rank: getRank(totalScore),
      member: data.member,
    };
  });

  // Sort & lấy top 3
  return result.sort((a, b) => b.totalScore - a.totalScore).slice(0, 3);
}

async function getRankingThisYear() {
  const currentYear = new Date().getFullYear();

  const grades = await prisma.grade.findMany({
    where: { yearActive: currentYear },
    include: {
      mMember: true,
      category: true,
    },
  });

  const categories = await prisma.gradeCategory.findMany({
    where: { active: true },
  });

  // group theo member
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
    const totalScore = calculateTotalScoreDynamic(
      {
        knowledge: m.scores["Kiến thức"],
        skill: m.scores["Kỹ năng"],
        attendance: m.scores["Chuyên cần"],
        bonus: m.scores["Thưởng"],
        penalty: m.scores["Phạt"],
      },
      categories,
    );

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
      yearActive: currentYear,
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
    const avg =
      m.scores.reduce((a, b) => a + b, 0) / m.scores.length;

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
};
