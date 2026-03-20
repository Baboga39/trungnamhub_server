
const prisma = require("../libs/prisma");
const { formatDate } = require("../libs/formatDate");
const { getRank } = require("../libs/scoreCalculator");
const { buildActivityMap } = require("./gradeService");
const { sendReportMail } = require("./mailService/mailService");
const pLimit = require("p-limit").default;
const retry = require("../libs/reportHelper").retry;
const ensureDir = require("../libs/reportHelper").ensureDir;
const getBrowser = require("../libs/reportHelper").getBrowser;
const buildHTML = require("./mailService/templates/buildHTML");

const limit = pLimit(6);


const exportBatchPDF = async (memberIds, year, quarter,email) => {
  const results = await Promise.all(
    memberIds.map((id) =>
      limit(() =>
        retry(() => generateMemberReportPDF(id, year, quarter,email), 3)
      )
    )
  );

  return results;
};

const exportBatchAllPDF = async (year, quarter,email) => {
  const members = await prisma.member.findMany({
    where: { active: true },
    select: { id: true },
  });

  const memberIds = members.map((m) => m.id);
  const results = await Promise.all(
    memberIds.map((id) =>
      limit(() =>
        retry(() => generateMemberReportPDF(id, year, quarter,email), 3)
      )
    )
  );

  return results;
};


const generatePDFBuffer = async (html) => {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: "domcontentloaded" });

  // await page.waitForSelector("#chart");

  await new Promise(resolve => setTimeout(resolve, 1000));


  const buffer = await page.pdf({
    format: "A4",
    printBackground: true,
  });

  await page.close();
  return buffer;
};

const getRankColor = (rank) => {
  switch (rank) {
    case "Xuất sắc":
      return "#16a34a"; // green
    case "Khá":
      return "#2563eb"; // blue
    case "Trung bình":
      return "#f59e0b"; // yellow
    default:
      return "#dc2626"; // red
  }
};


// =============================
// 1. GET DATA
// =============================
const getMemberData = async (memberId, year, quarter) => {
  const start = new Date(year, (quarter - 1) * 3, 1);
  const end = new Date(year, quarter * 3, 1);

 const [member, sessions] = await Promise.all([
  prisma.member.findUnique({
    where: { id: memberId },
    include: {
      grades: {
        where: { year, quarter },
        include: { category: true },
      },
      attendances: true,
      activityAttendances: {
        include: { activity: true },
      },
    },
  }),

  prisma.session.findMany({
    where: {
      date: { gte: start, lt: end },
    },
    orderBy: { date: "asc" },
  }),
]);

  return { ...member, sessions };
};

// =============================
// 2. SCORE
// =============================
const processScore = (grades, activityScore = 0) => {
  let weightedSum = 0;
  let totalWeight = 0;

  let bonus = 0;
  let penalty = 0;

  const rows = grades.map((g) => {
    const name = g.category.name;
    const weight = g.category.weight;
    const score = g.score;

    // ✅ THƯỞNG
    if (name === "Thưởng") {
      bonus += score;
      return {
        name,
        score,
        weight: "+",
        weighted: score,
      };
    }

    // ✅ PHẠT
    if (name === "Phạt") {
      penalty += score;
      return {
        name,
        score,
        weight: "-",
        weighted: -score,
      };
    }

    // ✅ CORE
    const weighted = score * weight;
    weightedSum += weighted;
    totalWeight += weight;

    return {
      name,
      score,
      weight,
      weighted,
    };
  });

  const avgScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // 🔥 FIX CHÍNH Ở ĐÂY
  const total = Number(
    (avgScore + bonus - penalty + activityScore).toFixed(1)
  );

  // 👉 thêm activity vào bảng
  rows.push({
    name: "Hoạt động",
    score: activityScore,
    weight: "+",
    weighted: activityScore,
  });

  return {
    rows,
    avgScore,
    bonus,
    penalty,
    activityScore,
    total,
  };
};
// =============================
// 3. ATTENDANCE
// =============================
const processAttendance = (sessions, attendances) => {
  const map = new Map(
    attendances.map((a) => [new Date(a.date).toISOString(), a]),
  );

  const list = sessions.map((s) => {
    const key = new Date(s.date).toISOString();
    const record = map.get(key);

    return (
      record || {
        date: s.date,
        status: "present",
        note: "",
      }
    );
  });

  return {
    summary: {
      present: list.filter((a) => a.status === "present").length,
      absent: list.filter((a) => a.status === "absent").length,
      late: list.filter((a) => a.status === "late").length,
    },
    list,
  };
};

// =============================
// 4. ACTIVITY
// =============================
const processActivity = (activities) => {
  return {
    summary: {
      joined: activities.filter((a) => a.status === "joined").length,
      total: activities.length,
    },
    list: activities.sort(
      (a, b) => new Date(a.activity.date) - new Date(b.activity.date),
    ),
  };
};
// =============================
// 7. MAIN
// =============================

const generateMemberReportPDF = async (memberId, year, quarter, email) => {
  const data = await getMemberData(memberId, year, quarter);
  if (!data) throw new Error("Member not found");

  const attendance = processAttendance(data.sessions, data.attendances);
  const activityMap = buildActivityMap(data.activityAttendances, true);

  const key = `${memberId}_${year}_${quarter}`;
  const activityData = activityMap.get(key) || { score: 0, count: 0 };

  const score = processScore(data.grades, activityData.score);
  const activity = processActivity(data.activityAttendances);

  const rank = getRank(score.total);
  const rankColor = getRankColor(rank);

  const user = await prisma.user.findUnique({
    where: { email },
  });

  const html = buildHTML(
    data,
    score,
    attendance,
    activity,
    year,
    quarter,
    rank,
    rankColor,
  );

  const pdfBuffer = await generatePDFBuffer(html);


  sendReportMail({
    meta: {
      toEmail: email,
      tenTruongDoan: user?.name || "Trung Nam Hub",
      tieuDeBaoCao: `Báo cáo quý ${quarter} của ${data.name}`,
      tenNguoiGui: "Hệ thống Trung Nam",
      loaiBaoCao: "Quý",
    },
    attachments: [
      {
        filename: `${data.name}_Q${quarter}_${year}.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  return true;
};


module.exports = {
  generateMemberReportPDF,
  exportBatchPDF,
  exportBatchAllPDF
};
