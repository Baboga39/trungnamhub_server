
const prisma = require("../libs/prisma");
const { formatDate } = require("../libs/formatDate");
const { getRank } = require("../libs/scoreCalculator");
const { buildActivityMap } = require("./gradeService");
const { sendReportMail } = require("./mailService/mailService");
const pLimit = require("p-limit").default;
const retry = require("../libs/reportHelper").retry;
const buildPDFDefinition = require("./mailService/templates/buildPDF");
const pdfmake = require("pdfmake");
const path = require("path");
const archiver = require("archiver");
const { PassThrough } = require("stream");
const ExcelJS = require("exceljs");

const { buildBranchFilter } = require("./member.service");
const fontsDir = path.join(require.resolve("pdfmake"), "../../fonts/Roboto");
pdfmake.setFonts({
  Roboto: {
    normal: path.join(fontsDir, "Roboto-Regular.ttf"),
    bold: path.join(fontsDir, "Roboto-Medium.ttf"),
    italics: path.join(fontsDir, "Roboto-Italic.ttf"),
    bolditalics: path.join(fontsDir, "Roboto-MediumItalic.ttf"),
  },
});
// Cho phép đọc font local
pdfmake.setLocalAccessPolicy(() => true);
// Không cho phép tải tài nguyên URL bên ngoài trong PDF
pdfmake.setUrlAccessPolicy(() => false);

const limit = pLimit(6);

const createZip = (files) => {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    const stream = new PassThrough();
    const chunks = [];

    stream.on("data", (chunk) => chunks.push(chunk));

    stream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    stream.on("error", reject);
    archive.on("error", reject);

    archive.pipe(stream);

    for (const file of files) {
      archive.append(file.buffer, {
        name: file.filename,
      });
    }

    archive.finalize();
  });
};

const exportBatchPDF = async (memberIds, year, quarter, email) => {
  const results = await Promise.all(
    memberIds.map((id) =>
      limit(() =>
        retry(() => generateMemberReportPDF(id, year, quarter, email), 3)
      )
    )
  );

  return results;
};

const exportBatchAllPDF = async (year, quarter, email, user) => {
  const branchFilter = buildBranchFilter(user);
  const members = await prisma.member.findMany({
    where: { active: true, ...branchFilter },
    select: { id: true },
  });
  const reports = await Promise.all(
    members.map((member) =>
      limit(() =>
        retry(
          () =>
            generateMemberReportPDF(
              member.id,
              year,
              quarter,
              null
            ),
          3
        )
      )
    )
  );

  const zipBuffer = await createZip(reports);

  if (email) {
    let emailString = Array.isArray(email) ? email.join(", ") : email;
    sendReportMail({
      meta: {
        toEmail: emailString,
        tenTruongDoan: "Quản trị viên",
        tieuDeBaoCao: `Báo cáo hàng loạt Tất cả đoàn sinh Q${quarter}/${year}`,
        tenNguoiGui: "Hệ thống Trung Nam",
        loaiBaoCao: "Hàng loạt",
      },
      attachments: [
        {
          filename: `All_Members_Q${quarter}_${year}.zip`,
          content: zipBuffer,
        },
      ],
    }).catch((err) => {
      console.error("❌ Send Batch Report Mail Error: ", err);
    });
  }

  return {
    filename: `All_Members_Q${quarter}_${year}.zip`,
    buffer: zipBuffer,
  };
};


const generatePDFBuffer = async (docDefinition) => {
  return pdfmake.createPdf(docDefinition).getBuffer();
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

  let user = null;
  let emailString = null;
  if (email) {
    if (Array.isArray(email)) {
      if (email.length > 0) {
        emailString = email.join(", ");
        user = await prisma.user.findUnique({
          where: { email: email[0] },
        });
      }
    } else if (typeof email === "string" && email.trim() !== "") {
      emailString = email;
      user = await prisma.user.findUnique({
        where: { email },
      });
    }
  }

  const docDefinition = await buildPDFDefinition(
    data,
    score,
    attendance,
    activity,
    year,
    quarter,
    rank,
    rankColor,
  );

  const pdfBuffer = await generatePDFBuffer(docDefinition);

  if (emailString) {
    sendReportMail({
      meta: {
        toEmail: emailString,
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
    }).catch((err) => {
      console.error("❌ Send Report Mail Promise Error: ", err);
    });
  }

 return {
  filename: `${data.name}_Q${quarter}_${year}.pdf`,
  buffer: pdfBuffer,
};
};

// ============================================================================
// 8. BÁO CÁO CHUYÊN CẦN QUÝ (PDF + EXCEL ZIP)
// ============================================================================

const getAttendanceQuarterlyData = async (year, quarter, user) => {
  const branchFilter = buildBranchFilter(user);
  const startMonth = (quarter - 1) * 3;
  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, startMonth + 3, 1);

  const sessions = await prisma.session.findMany({
    where: {
      date: {
        gte: startDate,
        lt: endDate,
      },
      ...branchFilter
    },
    orderBy: { date: "asc" },
  });

  const defaultTotalSessions = sessions.length;

  const members = await prisma.member.findMany({
    where: { active: true, ...branchFilter },
    include: {
      attendances: {
        where: {
          date: {
            gte: startDate,
            lt: endDate,
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Lấy các ngày điểm danh theo từng ngành
  const attendanceBranchRecords = await prisma.attendance.findMany({
    where: {
      date: { gte: startDate, lt: endDate },
      member: { branch: { not: null } },
    },
    select: {
      date: true,
      member: { select: { branch: true } },
    },
  });

  const branchDatesMap = new Map();
  for (const record of attendanceBranchRecords) {
    const b = record.member?.branch;
    if (!b) continue;
    if (!branchDatesMap.has(b)) branchDatesMap.set(b, new Set());
    branchDatesMap.get(b).add(new Date(record.date).toISOString());
  }

  let totalPresentCount = 0;
  let totalLateCount = 0;
  let totalExcusedCount = 0;
  let totalAbsentCount = 0;

  const memberStats = members.map((m) => {
    const late = m.attendances.filter((a) => a.status === "late").length;
    const excused = m.attendances.filter((a) => a.status === "excused").length;
    const absent = m.attendances.filter((a) => a.status === "absent").length;

    const mBranch = m.branch || "Đang cập nhật";
    const branchSet = branchDatesMap.get(mBranch);
    const mTotalSessions = (branchSet && branchSet.size > 0) ? branchSet.size : defaultTotalSessions;

    // Không có record trong DB nghĩa là CÓ MẶT
    const present = Math.max(0, mTotalSessions - (late + excused + absent));

    totalPresentCount += present;
    totalLateCount += late;
    totalExcusedCount += excused;
    totalAbsentCount += absent;

    // Tính điểm vắng quy đổi
    const absentEquivalent = absent * 1 + late * 0.5 + excused * 0.2;
    const presentEquivalent = Math.max(0, mTotalSessions - absentEquivalent);

    const ratePercent = mTotalSessions > 0 ? Number(((presentEquivalent / mTotalSessions) * 100).toFixed(1)) : 0;
    const score = mTotalSessions > 0 ? Number(((presentEquivalent / mTotalSessions) * 10).toFixed(1)) : 0;

    let rating = "Tuyên dương";
    let ratingColor = "#16a34a";

    if (ratePercent >= 90) {
      rating = "Tuyên dương";
      ratingColor = "#16a34a";
    } else if (ratePercent >= 75) {
      rating = "Tốt";
      ratingColor = "#2563eb";
    } else if (ratePercent >= 50) {
      rating = "Cần nhắc nhở";
      ratingColor = "#d97706";
    } else {
      rating = "Báo động";
      ratingColor = "#dc2626";
    }

    return {
      id: m.id,
      name: m.name,
      branch: mBranch,
      group: m.group || "Đang cập nhật",
      present,
      late,
      excused,
      absent,
      ratePercent,
      score,
      rating,
      ratingColor,
    };
  });

  const ratingSummary = {
    tuyenDuong: memberStats.filter((s) => s.rating === "Tuyên dương").length,
    tot: memberStats.filter((s) => s.rating === "Tốt").length,
    nhacNho: memberStats.filter((s) => s.rating === "Cần nhắc nhở").length,
    baoDong: memberStats.filter((s) => s.rating === "Báo động").length,
  };

  const overallRatePercent =
    memberStats.length > 0
      ? Number(
          (
            memberStats.reduce((sum, m) => sum + m.ratePercent, 0) /
            memberStats.length
          ).toFixed(1)
        )
      : 0;

  return {
    year,
    quarter,
    totalSessions: defaultTotalSessions,
    totalMembers: memberStats.length,
    overallRatePercent,
    ratingSummary,
    totalPresentCount,
    totalLateCount,
    totalExcusedCount,
    totalAbsentCount,
    members: memberStats,
  };
};

const generateAttendanceMultiQuarterExcel = async (quartersDataList, year, quarters) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hệ thống Quản lý Trung Nam Hub";
  workbook.created = new Date();

  const isSingle = quarters.length === 1;
  const singleData = quartersDataList[0];

  // Helper styles
  const headerStyle = (row, bgColor = "FF1E40AF") => {
    row.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    row.height = 26;
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });
  };

  const applyBorders = (row) => {
    row.alignment = { vertical: "middle" };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  };

  // -------------------------------------------------------------
  // SHEET 1: TỔNG QUAN & SO SÁNH CÁC QUÝ
  // -------------------------------------------------------------
  const summarySheet = workbook.addWorksheet("Tổng quan & So sánh");
  summarySheet.mergeCells("A1:G1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = isSingle
    ? `BÁO CÁO THỐNG KÊ CHUYÊN CẦN QUÝ ${quarters[0]} NĂM ${year}`
    : `BÁO CÁO TỔNG QUAN & SO SÁNH CHUYÊN CẦN ${quarters.map((q) => `QUÝ ${q}`).join(", ")} NĂM ${year}`;
  titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF1E3A8A" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  summarySheet.getRow(1).height = 32;

  summarySheet.addRow([]);

  // Bảng chỉ số so sánh giữa các quý
  const headerSummaryCols = ["Chỉ số / Tiêu chí", ...quarters.map((q) => `Quý ${q}`)];
  if (!isSingle) headerSummaryCols.push("Trung bình / Tổng");
  const hSumRow = summarySheet.addRow(headerSummaryCols);
  headerStyle(hSumRow, "FF1E40AF");

  // Hàng: Tổng số buổi
  const sessionsRow = [
    "Tổng số buổi sinh hoạt",
    ...quartersDataList.map((d) => `${d.totalSessions} buổi`),
  ];
  if (!isSingle) {
    const totalAllSessions = quartersDataList.reduce((sum, d) => sum + d.totalSessions, 0);
    sessionsRow.push(`${totalAllSessions} buổi`);
  }
  applyBorders(summarySheet.addRow(sessionsRow));

  // Hàng: Số đoàn sinh
  const membersRow = [
    "Tổng số đoàn sinh",
    ...quartersDataList.map((d) => `${d.totalMembers} em`),
  ];
  if (!isSingle) {
    membersRow.push(`${singleData.totalMembers} em`);
  }
  applyBorders(summarySheet.addRow(membersRow));

  // Hàng: % Chuyên cần chung
  const rateRow = [
    "Tỷ lệ Chuyên cần chung",
    ...quartersDataList.map((d) => `${d.overallRatePercent}%`),
  ];
  if (!isSingle) {
    const avgRate = (
      quartersDataList.reduce((sum, d) => sum + d.overallRatePercent, 0) / quartersDataList.length
    ).toFixed(1);
    rateRow.push(`${avgRate}%`);
  }
  applyBorders(summarySheet.addRow(rateRow));

  // Hàng: Tuyên dương
  const tdRow = [
    "Tuyên dương (>= 90%)",
    ...quartersDataList.map((d) => `${d.ratingSummary.tuyenDuong} em`),
  ];
  if (!isSingle) tdRow.push("-");
  applyBorders(summarySheet.addRow(tdRow));

  // Hàng: Tốt / Đạt
  const totRow = [
    "Tốt / Đạt (75% - 89.9%)",
    ...quartersDataList.map((d) => `${d.ratingSummary.tot} em`),
  ];
  if (!isSingle) totRow.push("-");
  applyBorders(summarySheet.addRow(totRow));

  // Hàng: Cần nhắc nhở
  const nnRow = [
    "Cần nhắc nhở (50% - 74.9%)",
    ...quartersDataList.map((d) => `${d.ratingSummary.nhacNho} em`),
  ];
  if (!isSingle) nnRow.push("-");
  applyBorders(summarySheet.addRow(nnRow));

  // Hàng: Báo động
  const bdRow = [
    "Báo động (< 50%)",
    ...quartersDataList.map((d) => `${d.ratingSummary.baoDong} em`),
  ];
  if (!isSingle) bdRow.push("-");
  applyBorders(summarySheet.addRow(bdRow));

  summarySheet.columns = [
    { width: 32 },
    ...quarters.map(() => ({ width: 18 })),
    { width: 22 },
  ];

  // -------------------------------------------------------------
  // SHEET 2: BẢNG TỔNG HỢP THEO ĐOÀN SINH (KHI CHỌN NHIỀU QUÝ)
  // -------------------------------------------------------------
  if (!isSingle) {
    const matrixSheet = workbook.addWorksheet("Bảng Tổng Hợp Các Quý");
    matrixSheet.mergeCells("A1:K1");
    const mTitle = matrixSheet.getCell("A1");
    mTitle.value = `BẢNG TỔNG HỢP CHUYÊN CẦN ${quarters.map((q) => `QUÝ ${q}`).join(" - ")} NĂM ${year}`;
    mTitle.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F766E" } };
    mTitle.alignment = { horizontal: "center", vertical: "middle" };
    matrixSheet.getRow(1).height = 32;

    matrixSheet.addRow([]);

    const matrixHeader = [
      "STT",
      "Mã ĐS",
      "Họ và tên",
      "Ngành",
      "Phân đoàn / Đội",
      ...quarters.map((q) => `% CC Q${q}`),
      "% Chuyên cần TB",
      "Điểm quy đổi (10)",
      "Xếp loại chung",
    ];
    const mHRow = matrixSheet.addRow(matrixHeader);
    headerStyle(mHRow, "FF0F766E");

    // Lấy danh sách đoàn sinh từ quý đầu tiên
    const memberMap = new Map();
    quartersDataList.forEach((qData, qIdx) => {
      const qNum = quarters[qIdx];
      qData.members.forEach((m) => {
        if (!memberMap.has(m.id)) {
          memberMap.set(m.id, {
            id: m.id,
            name: m.name,
            branch: m.branch,
            group: m.group,
            qRates: {},
            qScores: {},
          });
        }
        memberMap.get(m.id).qRates[qNum] = m.ratePercent;
        memberMap.get(m.id).qScores[qNum] = m.score;
      });
    });

    let stt = 1;
    memberMap.forEach((m) => {
      const rateValues = quarters.map((q) => m.qRates[q]).filter((r) => typeof r === "number");
      const avgRate = rateValues.length > 0
        ? Number((rateValues.reduce((a, b) => a + b, 0) / rateValues.length).toFixed(1))
        : 0;

      const scoreValues = quarters.map((q) => m.qScores[q]).filter((s) => typeof s === "number");
      const avgScore = scoreValues.length > 0
        ? Number((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length).toFixed(1))
        : 0;

      let rating = "Tuyên dương";
      if (avgRate < 50) rating = "Báo động";
      else if (avgRate < 75) rating = "Cần nhắc nhở";
      else if (avgRate < 90) rating = "Tốt";

      const rowData = [
        stt++,
        m.id,
        m.name,
        m.branch || "",
        m.group || "",
        ...quarters.map((q) => (m.qRates[q] !== undefined ? `${m.qRates[q]}%` : "-")),
        `${avgRate}%`,
        avgScore,
        rating,
      ];

      const r = matrixSheet.addRow(rowData);
      applyBorders(r);
      r.getCell(1).alignment = { horizontal: "center" };
      r.getCell(2).alignment = { horizontal: "center" };
      r.getCell(4).alignment = { horizontal: "center" };
      r.getCell(5).alignment = { horizontal: "center" };
      quarters.forEach((_, idx) => {
        r.getCell(6 + idx).alignment = { horizontal: "center" };
      });
      r.getCell(6 + quarters.length).alignment = { horizontal: "center" };
      r.getCell(7 + quarters.length).alignment = { horizontal: "center" };
      r.getCell(8 + quarters.length).alignment = { horizontal: "center" };
    });

    matrixSheet.columns = [
      { width: 6 },
      { width: 8 },
      { width: 25 },
      { width: 15 },
      { width: 16 },
      ...quarters.map(() => ({ width: 14 })),
      { width: 18 },
      { width: 18 },
      { width: 16 },
    ];
  }

  // -------------------------------------------------------------
  // CHI TIẾT TỪNG QUÝ ĐƯỢC CHỌN (TỪNG SHEET)
  // -------------------------------------------------------------
  quartersDataList.forEach((qData, qIdx) => {
    const qNum = quarters[qIdx];
    const detailSheet = workbook.addWorksheet(`Chi tiết Quý ${qNum}`);

    detailSheet.mergeCells("A1:J1");
    const detailTitle = detailSheet.getCell("A1");
    detailTitle.value = `DANH SÁCH CHI TIẾT CHUYÊN CẦN QUÝ ${qNum} NĂM ${year}`;
    detailTitle.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF1E3A8A" } };
    detailTitle.alignment = { horizontal: "center", vertical: "middle" };
    detailSheet.getRow(1).height = 30;

    detailSheet.addRow([]);

    const headerRow = detailSheet.addRow([
      "STT",
      "Họ và tên Đoàn sinh",
      "Phân đoàn / Đội",
      "Có mặt",
      "Đi trễ",
      "Vắng phép",
      "Vắng ko phép",
      "Tỷ lệ % Chuyên cần",
      "Điểm quy đổi (10)",
      "Xếp loại",
    ]);
    headerStyle(headerRow, "FF0D9488");

    qData.members.forEach((m, idx) => {
      const row = detailSheet.addRow([
        idx + 1,
        m.name,
        m.group,
        m.present,
        m.late,
        m.excused,
        m.absent,
        `${m.ratePercent}%`,
        m.score,
        m.rating,
      ]);
      applyBorders(row);
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(4).alignment = { horizontal: "center" };
      row.getCell(5).alignment = { horizontal: "center" };
      row.getCell(6).alignment = { horizontal: "center" };
      row.getCell(7).alignment = { horizontal: "center" };
      row.getCell(8).alignment = { horizontal: "center" };
      row.getCell(9).alignment = { horizontal: "center" };
      row.getCell(10).alignment = { horizontal: "center" };
    });

    detailSheet.columns = [
      { width: 6 },
      { width: 26 },
      { width: 18 },
      { width: 10 },
      { width: 10 },
      { width: 12 },
      { width: 14 },
      { width: 20 },
      { width: 18 },
      { width: 16 },
    ];
  });

  return workbook.xlsx.writeBuffer();
};

const generateAttendanceMultiQuarterPDF = async (quartersDataList, year, quarters) => {
  const isSingle = quarters.length === 1;
  const content = [];

  content.push({ text: "HỆ THỐNG QUẢN LÝ TRUNG NAM HUB", style: "subHeader" });
  content.push({
    text: isSingle
      ? `BÁO CÁO THỐNG KÊ CHUYÊN CẦN QUÝ ${quarters[0]} / NĂM ${year}`
      : `BÁO CÁO THỐNG KÊ CHUYÊN CẦN ${quarters.map((q) => `QUÝ ${q}`).join(", ")} / NĂM ${year}`,
    style: "mainHeader",
  });
  content.push({
    text: `Ngày kết xuất: ${new Date().toLocaleDateString("vi-VN")}`,
    style: "dateText",
  });
  content.push({ text: "\n" });

  // Bảng tóm tắt so sánh các quý
  const summaryTableBody = [
    [
      { text: "Quý", style: "tableHeader", alignment: "center" },
      { text: "Tổng số buổi", style: "tableHeader", alignment: "center" },
      { text: "Số đoàn sinh", style: "tableHeader", alignment: "center" },
      { text: "% Chuyên cần", style: "tableHeader", alignment: "center" },
      { text: "Tuyên dương (>=90%)", style: "tableHeader", alignment: "center" },
      { text: "Tốt (75-89%)", style: "tableHeader", alignment: "center" },
      { text: "Nhắc nhở (50-74%)", style: "tableHeader", alignment: "center" },
      { text: "Báo động (<50%)", style: "tableHeader", alignment: "center" },
    ],
  ];

  quartersDataList.forEach((qData, idx) => {
    summaryTableBody.push([
      { text: `Quý ${quarters[idx]}`, bold: true, alignment: "center" },
      { text: `${qData.totalSessions} buổi`, alignment: "center" },
      { text: `${qData.totalMembers} em`, alignment: "center" },
      { text: `${qData.overallRatePercent}%`, bold: true, color: "#0284C7", alignment: "center" },
      { text: `${qData.ratingSummary.tuyenDuong} em`, color: "#16A34A", alignment: "center" },
      { text: `${qData.ratingSummary.tot} em`, color: "#2563EB", alignment: "center" },
      { text: `${qData.ratingSummary.nhacNho} em`, color: "#D97706", alignment: "center" },
      { text: `${qData.ratingSummary.baoDong} em`, color: "#DC2626", alignment: "center" },
    ]);
  });

  content.push({ text: "I. BẢNG TỔNG QUAN CHỈ SỐ CÁC QUÝ", style: "sectionHeader" });
  content.push({ text: "\n" });
  content.push({
    table: {
      headerRows: 1,
      widths: ["12%", "13%", "13%", "14%", "13%", "11%", "12%", "12%"],
      body: summaryTableBody,
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 1 : 0.5),
      vLineWidth: () => 0.5,
      hLineColor: () => "#E5E7EB",
      vLineColor: () => "#E5E7EB",
    },
  });

  content.push({ text: "\n\n" });

  // Danh sách chi tiết từng quý
  quartersDataList.forEach((qData, qIdx) => {
    const qNum = quarters[qIdx];

    if (qIdx > 0 || !isSingle) {
      content.push({ text: `II.${qIdx + 1}. DANH SÁCH CHI TIẾT CHUYÊN CẦN QUÝ ${qNum}`, style: "sectionHeader" });
    } else {
      content.push({ text: `II. DANH SÁCH CHI TIẾT CHUYÊN CẦN QUÝ ${qNum}`, style: "sectionHeader" });
    }

    content.push({ text: "\n" });

    const tableBody = [
      [
        { text: "STT", style: "tableHeader", alignment: "center" },
        { text: "Họ và tên", style: "tableHeader" },
        { text: "Phân đoàn", style: "tableHeader" },
        { text: "Có mặt", style: "tableHeader", alignment: "center" },
        { text: "Trễ", style: "tableHeader", alignment: "center" },
        { text: "Phép", style: "tableHeader", alignment: "center" },
        { text: "Vắng", style: "tableHeader", alignment: "center" },
        { text: "Tỷ lệ %", style: "tableHeader", alignment: "center" },
        { text: "Điểm", style: "tableHeader", alignment: "center" },
        { text: "Xếp loại", style: "tableHeader", alignment: "center" },
      ],
    ];

    qData.members.forEach((m, idx) => {
      tableBody.push([
        { text: (idx + 1).toString(), alignment: "center" },
        { text: m.name, bold: true },
        { text: m.group },
        { text: m.present.toString(), alignment: "center" },
        { text: m.late.toString(), alignment: "center" },
        { text: m.excused.toString(), alignment: "center" },
        { text: m.absent.toString(), alignment: "center" },
        { text: `${m.ratePercent}%`, bold: true, alignment: "center" },
        { text: m.score.toString(), alignment: "center" },
        { text: m.rating, bold: true, color: m.ratingColor, alignment: "center" },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        widths: ["6%", "23%", "15%", "8%", "6%", "6%", "6%", "11%", "7%", "12%"],
        body: tableBody,
      },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 1 : 0.5),
        vLineWidth: () => 0.5,
        hLineColor: () => "#E5E7EB",
        vLineColor: () => "#E5E7EB",
      },
    });

    if (qIdx < quartersDataList.length - 1) {
      content.push({ text: "", pageBreak: "before" });
    }
  });

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [30, 30, 30, 30],
    content,
    styles: {
      mainHeader: {
        fontSize: 15,
        bold: true,
        color: "#1E3A8A",
        alignment: "center",
        margin: [0, 2, 0, 2],
      },
      subHeader: {
        fontSize: 9,
        bold: true,
        color: "#6B7280",
        alignment: "center",
      },
      dateText: {
        fontSize: 8,
        italics: true,
        color: "#9CA3AF",
        alignment: "center",
      },
      sectionHeader: {
        fontSize: 11,
        bold: true,
        color: "#111827",
      },
      tableHeader: {
        fontSize: 9,
        bold: true,
        color: "#FFFFFF",
        fillColor: "#0D9488",
        margin: [2, 4, 2, 4],
      },
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 8.5,
    },
  };

  return generatePDFBuffer(docDefinition);
};

const generateAttendanceQuarterlyReportBundle = async (year, quartersInput, email, user) => {
  let quarters = [];
  if (Array.isArray(quartersInput)) {
    quarters = quartersInput.map(Number).filter((q) => q >= 1 && q <= 4);
  } else if (quartersInput) {
    quarters = [Number(quartersInput)];
  }

  if (quarters.length === 0) {
    quarters = [Math.ceil((new Date().getMonth() + 1) / 3)];
  }
  quarters.sort((a, b) => a - b);

  // Lấy dữ liệu cho từng quý
  const quartersDataList = await Promise.all(
    quarters.map((q) => getAttendanceQuarterlyData(year, q, user))
  );

  // Sinh đúng 1 file PDF và 1 file Excel chứa tất cả các quý đã chọn
  const [pdfBuffer, excelBuffer] = await Promise.all([
    generateAttendanceMultiQuarterPDF(quartersDataList, year, quarters),
    generateAttendanceMultiQuarterExcel(quartersDataList, year, quarters),
  ]);

  const quarterLabel = quarters.map((q) => `Q${q}`).join("_");
  const pdfFilename = `BaoCaoChuyenCan_${quarterLabel}_${year}.pdf`;
  const excelFilename = `BaoCaoChuyenCan_${quarterLabel}_${year}.xlsx`;
  const zipFilename = `BaoCaoChuyenCan_${quarterLabel}_${year}.zip`;

  const zipBuffer = await createZip([
    { filename: pdfFilename, buffer: pdfBuffer },
    { filename: excelFilename, buffer: excelBuffer },
  ]);

  if (email) {
    let emailString = Array.isArray(email) ? email.join(", ") : email;
    sendReportMail({
      meta: {
        toEmail: emailString,
        tenTruongDoan: "Huynh Trưởng / Quản Trị Viên",
        tieuDeBaoCao: `Báo cáo Chuyên cần ${quarters.map((q) => `Quý ${q}`).join(", ")}/${year} (PDF & Excel)`,
        tenNguoiGui: "Hệ thống Trung Nam",
        loaiBaoCao: "Chuyên cần Quý",
      },
      attachments: [
        {
          filename: zipFilename,
          content: zipBuffer,
        },
      ],
    }).catch((err) => {
      console.error("❌ Send Attendance Quarterly Report Email Error: ", err);
    });
  }

  return {
    filename: zipFilename,
    buffer: zipBuffer,
  };
};

const getAttendanceAllTimeData = async (user) => {
  const branchFilter = buildBranchFilter(user);
  const sessions = await prisma.session.findMany({
    where: { ...branchFilter },
    orderBy: { date: "asc" },
  });

  const defaultTotalSessions = sessions.length;

  const members = await prisma.member.findMany({
    where: { active: true, ...branchFilter },
    include: {
      attendances: true,
    },
    orderBy: { name: "asc" },
  });

  const attendanceBranchRecords = await prisma.attendance.findMany({
    where: {
      member: { branch: { not: null } },
    },
    select: {
      date: true,
      member: { select: { branch: true } },
    },
  });

  const branchDatesMap = new Map();
  for (const record of attendanceBranchRecords) {
    const b = record.member?.branch;
    if (!b) continue;
    if (!branchDatesMap.has(b)) branchDatesMap.set(b, new Set());
    branchDatesMap.get(b).add(new Date(record.date).toISOString());
  }

  let totalPresentCount = 0;
  let totalLateCount = 0;
  let totalExcusedCount = 0;
  let totalAbsentCount = 0;

  const memberStats = members.map((m) => {
    const late = m.attendances.filter((a) => a.status === "late").length;
    const excused = m.attendances.filter((a) => a.status === "excused").length;
    const absent = m.attendances.filter((a) => a.status === "absent").length;

    const mBranch = m.branch || "Đang cập nhật";
    const branchSet = branchDatesMap.get(mBranch);
    const mTotalSessions = (branchSet && branchSet.size > 0) ? branchSet.size : defaultTotalSessions;

    // Không có bản ghi trong DB nghĩa là CÓ MẶT
    const present = Math.max(0, mTotalSessions - (late + excused + absent));

    totalPresentCount += present;
    totalLateCount += late;
    totalExcusedCount += excused;
    totalAbsentCount += absent;

    const absentEquivalent = absent * 1 + late * 0.5 + excused * 0.2;
    const presentEquivalent = Math.max(0, mTotalSessions - absentEquivalent);

    const ratePercent = mTotalSessions > 0 ? Number(((presentEquivalent / mTotalSessions) * 100).toFixed(1)) : 0;
    const score = mTotalSessions > 0 ? Number(((presentEquivalent / mTotalSessions) * 10).toFixed(1)) : 0;

    let rating = "Tuyên dương";
    let ratingColor = "#16a34a";

    if (ratePercent >= 90) {
      rating = "Tuyên dương";
      ratingColor = "#16a34a";
    } else if (ratePercent >= 75) {
      rating = "Tốt";
      ratingColor = "#2563eb";
    } else if (ratePercent >= 50) {
      rating = "Cần nhắc nhở";
      ratingColor = "#d97706";
    } else {
      rating = "Báo động";
      ratingColor = "#dc2626";
    }

    return {
      id: m.id,
      name: m.name,
      branch: mBranch,
      present,
      group: m.group || "Đang cập nhật",
      late,
      excused,
      absent,
      ratePercent,
      score,
      rating,
      ratingColor,
    };
  });

  const ratingSummary = {
    tuyenDuong: memberStats.filter((s) => s.rating === "Tuyên dương").length,
    tot: memberStats.filter((s) => s.rating === "Tốt").length,
    nhacNho: memberStats.filter((s) => s.rating === "Cần nhắc nhở").length,
    baoDong: memberStats.filter((s) => s.rating === "Báo động").length,
  };

  const overallRatePercent =
    memberStats.length > 0
      ? Number(
          (
            memberStats.reduce((sum, m) => sum + m.ratePercent, 0) /
            memberStats.length
          ).toFixed(1)
        )
      : 0;

  return {
    year: "Tất cả",
    quarter: "Toàn khóa",
    totalSessions: defaultTotalSessions,
    totalMembers: memberStats.length,
    overallRatePercent,
    ratingSummary,
    totalPresentCount,
    totalLateCount,
    totalExcusedCount,
    totalAbsentCount,
    members: memberStats,
  };
};

const generateAttendanceAllTimeReportBundle = async (email, user) => {
  const data = await getAttendanceAllTimeData(user);

  const [pdfBuffer, excelBuffer] = await Promise.all([
    generateAttendanceQuarterlyPDF(data),
    generateAttendanceQuarterlyExcel(data),
  ]);

  const pdfFilename = `BaoCaoChuyenCan_ToanKhoa.pdf`;
  const excelFilename = `BaoCaoChuyenCan_ToanKhoa.xlsx`;
  const zipFilename = `BaoCaoChuyenCan_ToanKhoa.zip`;

  const zipBuffer = await createZip([
    { filename: pdfFilename, buffer: pdfBuffer },
    { filename: excelFilename, buffer: excelBuffer },
  ]);

  if (email) {
    let emailString = Array.isArray(email) ? email.join(", ") : email;
    sendReportMail({
      meta: {
        toEmail: emailString,
        tenTruongDoan: "Huynh Trưởng / Quản Trị Viên",
        tieuDeBaoCao: `Báo cáo Chuyên cần Toàn khóa - Tất cả thời gian (PDF & Excel)`,
        tenNguoiGui: "Hệ thống Trung Nam",
        loaiBaoCao: "Chuyên cần Toàn khóa",
      },
      attachments: [
        {
          filename: zipFilename,
          content: zipBuffer,
        },
      ],
    }).catch((err) => {
      console.error("❌ Send Attendance All-Time Report Email Error: ", err);
    });
  }

  return {
    filename: zipFilename,
    buffer: zipBuffer,
  };
};

// ============================================================================
// 10. SAO LƯU DỮ LIỆU ĐOÀN SINH TOÀN DIỆN (MULTI-SHEET EXCEL BACKUP)
// ============================================================================

const generateMemberFullBackupExcel = async (year, email, user) => {
  const branchFilter = buildBranchFilter(user);
  const targetYear = year ? Number(year) : new Date().getFullYear();

  // Lấy danh sách toàn bộ đoàn sinh kèm điểm danh, điểm số, hoạt động
  const members = await prisma.member.findMany({
    where: { ...branchFilter },
    include: {
      attendances: {
        where: {
          date: {
            gte: new Date(targetYear, 0, 1),
            lt: new Date(targetYear + 1, 0, 1),
          },
        },
        orderBy: { date: "asc" },
      },
      grades: {
        where: { year: targetYear },
        include: { category: true },
        orderBy: [{ quarter: "asc" }, { categoryId: "asc" }],
      },
      activityAttendances: {
        include: { activity: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ branch: "asc" }, { group: "asc" }, { name: "asc" }],
  });

  // Lấy tổng số buổi sinh hoạt trong năm
  const sessions = await prisma.session.findMany({
    where: {
      date: {
        gte: new Date(targetYear, 0, 1),
        lt: new Date(targetYear + 1, 0, 1),
      },
      ...branchFilter,
    },
  });
  const totalYearSessions = sessions.length;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hệ thống Quản lý Trung Nam Hub";
  workbook.created = new Date();

  const headerStyle = (row, bgColor = "FF1E40AF") => {
    row.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    row.height = 26;
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });
  };

  const applyBorders = (row) => {
    row.alignment = { vertical: "middle" };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  };

  // -------------------------------------------------------------
  // SHEET 1: HỒ SƠ & LÝ LỊCH ĐOÀN SINH
  // -------------------------------------------------------------
  const profileSheet = workbook.addWorksheet("1. Hồ sơ Đoàn sinh");
  profileSheet.mergeCells("A1:P1");
  const title1 = profileSheet.getCell("A1");
  title1.value = `BẢNG SAO LƯU HỒ SƠ LÝ LỊCH ĐOÀN SINH NĂM ${targetYear}`;
  title1.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF1E3A8A" } };
  title1.alignment = { horizontal: "center", vertical: "middle" };
  profileSheet.getRow(1).height = 32;

  profileSheet.addRow([]);

  const header1 = profileSheet.addRow([
    "STT",
    "Mã ĐS",
    "Họ và tên",
    "Giới tính",
    "Ngày sinh",
    "Ngành",
    "Phân đoàn / Đội",
    "Giáo xứ",
    "Giáo họ",
    "SĐT liên hệ",
    "Địa chỉ",
    "Họ tên Cha",
    "Họ tên Mẹ",
    "Năm tham gia",
    "Ngày thăng tiến",
    "Trạng thái",
  ]);
  headerStyle(header1, "FF1E40AF");

  members.forEach((m, idx) => {
    const row = profileSheet.addRow([
      idx + 1,
      m.id,
      m.name,
      m.gender || "",
      m.birthDate ? new Date(m.birthDate).toLocaleDateString("vi-VN") : "",
      m.branch || "Chưa xếp",
      m.group || "Chưa xếp",
      m.parish || "",
      m.church || "",
      m.contact || "",
      m.address || "",
      m.fatherName || "",
      m.motherName || "",
      m.startYear || "",
      m.promotionDate ? new Date(m.promotionDate).toLocaleDateString("vi-VN") : "",
      m.active ? "Đang sinh hoạt" : "Tạm nghỉ",
    ]);
    applyBorders(row);
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "center" };
    row.getCell(5).alignment = { horizontal: "center" };
    row.getCell(6).alignment = { horizontal: "center" };
    row.getCell(7).alignment = { horizontal: "center" };
    row.getCell(14).alignment = { horizontal: "center" };
    row.getCell(15).alignment = { horizontal: "center" };
    row.getCell(16).alignment = { horizontal: "center" };
  });

  profileSheet.columns = [
    { width: 6 },
    { width: 8 },
    { width: 25 },
    { width: 10 },
    { width: 14 },
    { width: 15 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 15 },
    { width: 30 },
    { width: 20 },
    { width: 20 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
  ];

  // -------------------------------------------------------------
  // SHEET 2: TỔNG HỢP CHUYÊN CẦN
  // -------------------------------------------------------------
  const attSheet = workbook.addWorksheet("2. Tổng hợp Chuyên cần");
  attSheet.mergeCells("A1:L1");
  const title2 = attSheet.getCell("A1");
  title2.value = `BẢNG SAO LƯU TỔNG HỢP CHUYÊN CẦN NĂM ${targetYear}`;
  title2.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F766E" } };
  title2.alignment = { horizontal: "center", vertical: "middle" };
  attSheet.getRow(1).height = 32;

  attSheet.addRow([]);

  const header2 = attSheet.addRow([
    "STT",
    "Mã ĐS",
    "Họ và tên",
    "Ngành",
    "Phân đoàn / Đội",
    "Tổng buổi",
    "Có mặt",
    "Đi trễ",
    "Vắng phép",
    "Vắng ko phép",
    "% Chuyên cần",
    "Xếp loại",
  ]);
  headerStyle(header2, "FF0F766E");

  members.forEach((m, idx) => {
    const late = m.attendances.filter((a) => a.status === "late").length;
    const excused = m.attendances.filter((a) => a.status === "excused").length;
    const absent = m.attendances.filter((a) => a.status === "absent").length;
    const mTotal = totalYearSessions;
    const present = Math.max(0, mTotal - (late + excused + absent));

    const absentEq = absent * 1 + late * 0.5 + excused * 0.2;
    const presentEq = Math.max(0, mTotal - absentEq);
    const ratePercent = mTotal > 0 ? Number(((presentEq / mTotal) * 100).toFixed(1)) : 0;

    let rating = "Tuyên dương";
    if (ratePercent < 50) rating = "Báo động";
    else if (ratePercent < 75) rating = "Cần nhắc nhở";
    else if (ratePercent < 90) rating = "Tốt";

    const row = attSheet.addRow([
      idx + 1,
      m.id,
      m.name,
      m.branch || "",
      m.group || "",
      mTotal,
      present,
      late,
      excused,
      absent,
      `${ratePercent}%`,
      rating,
    ]);
    applyBorders(row);
    [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((colIdx) => {
      row.getCell(colIdx).alignment = { horizontal: "center" };
    });
  });

  attSheet.columns = [
    { width: 6 },
    { width: 8 },
    { width: 25 },
    { width: 15 },
    { width: 16 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 14 },
    { width: 15 },
    { width: 16 },
  ];

  // -------------------------------------------------------------
  // SHEET 3: BẢNG ĐIỂM & ĐÁNH GIÁ (GRADES)
  // -------------------------------------------------------------
  const gradeSheet = workbook.addWorksheet("3. Bảng điểm các Quý");
  gradeSheet.mergeCells("A1:K1");
  const title3 = gradeSheet.getCell("A1");
  title3.value = `BẢNG SAO LƯU ĐIỂM SỐ & XẾP LOẠI NĂM ${targetYear}`;
  title3.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF7C3AED" } };
  title3.alignment = { horizontal: "center", vertical: "middle" };
  gradeSheet.getRow(1).height = 32;

  gradeSheet.addRow([]);

  const header3 = gradeSheet.addRow([
    "STT",
    "Mã ĐS",
    "Họ và tên",
    "Ngành",
    "Phân đoàn / Đội",
    "Điểm Quý 1",
    "Điểm Quý 2",
    "Điểm Quý 3",
    "Điểm Quý 4",
    "Điểm TB Cả Năm",
    "Xếp loại",
  ]);
  headerStyle(header3, "FF7C3AED");

  members.forEach((m, idx) => {
    const qScores = { 1: [], 2: [], 3: [], 4: [] };
    m.grades.forEach((g) => {
      if (qScores[g.quarter]) qScores[g.quarter].push(g.score);
    });

    const getQuarterAvg = (q) => {
      const arr = qScores[q];
      if (!arr || arr.length === 0) return "-";
      return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1));
    };

    const q1 = getQuarterAvg(1);
    const q2 = getQuarterAvg(2);
    const q3 = getQuarterAvg(3);
    const q4 = getQuarterAvg(4);

    const validScores = [q1, q2, q3, q4].filter((s) => typeof s === "number");
    const yearAvg = validScores.length > 0
      ? Number((validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1))
      : "-";

    let gradeRank = "Chưa xếp loại";
    if (typeof yearAvg === "number") {
      if (yearAvg >= 8.5) gradeRank = "Xuất sắc";
      else if (yearAvg >= 7.0) gradeRank = "Khá";
      else if (yearAvg >= 5.0) gradeRank = "Trung bình";
      else gradeRank = "Yếu";
    }

    const row = gradeSheet.addRow([
      idx + 1,
      m.id,
      m.name,
      m.branch || "",
      m.group || "",
      q1,
      q2,
      q3,
      q4,
      yearAvg,
      gradeRank,
    ]);
    applyBorders(row);
    [1, 2, 4, 5, 6, 7, 8, 9, 10, 11].forEach((colIdx) => {
      row.getCell(colIdx).alignment = { horizontal: "center" };
    });
  });

  gradeSheet.columns = [
    { width: 6 },
    { width: 8 },
    { width: 25 },
    { width: 15 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
  ];

  // -------------------------------------------------------------
  // SHEET 4: LỊCH SỬ THAM GIA HOẠT ĐỘNG
  // -------------------------------------------------------------
  const actSheet = workbook.addWorksheet("4. Lịch sử Hoạt động");
  actSheet.mergeCells("A1:H1");
  const title4 = actSheet.getCell("A1");
  title4.value = `DANH SÁCH THAM GIA HOẠT ĐỘNG / PHONG TRÀO NĂM ${targetYear}`;
  title4.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFC026D3" } };
  title4.alignment = { horizontal: "center", vertical: "middle" };
  actSheet.getRow(1).height = 32;

  actSheet.addRow([]);

  const header4 = actSheet.addRow([
    "STT",
    "Mã ĐS",
    "Họ và tên",
    "Ngành",
    "Tên Hoạt động / Sự kiện",
    "Ngày diễn ra",
    "Trạng thái tham gia",
    "Điểm cộng",
  ]);
  headerStyle(header4, "FFC026D3");

  let actIdx = 1;
  members.forEach((m) => {
    m.activityAttendances.forEach((aa) => {
      const row = actSheet.addRow([
        actIdx++,
        m.id,
        m.name,
        m.branch || "",
        aa.activity?.name || "Hoạt động chung",
        aa.activity?.date ? new Date(aa.activity.date).toLocaleDateString("vi-VN") : "",
        aa.status === "present" ? "Có tham gia" : aa.status || "Có mặt",
        aa.score || 0,
      ]);
      applyBorders(row);
      [1, 2, 4, 6, 7, 8].forEach((colIdx) => {
        row.getCell(colIdx).alignment = { horizontal: "center" };
      });
    });
  });

  actSheet.columns = [
    { width: 6 },
    { width: 8 },
    { width: 25 },
    { width: 15 },
    { width: 30 },
    { width: 15 },
    { width: 20 },
    { width: 12 },
  ];

  const excelBuffer = await workbook.xlsx.writeBuffer();
  const filename = `SaoLuu_DuLieu_DoanSinh_ToanDien_${targetYear}.xlsx`;

  if (email) {
    let emailString = Array.isArray(email) ? email.join(", ") : email;
    sendReportMail({
      meta: {
        toEmail: emailString,
        tenTruongDoan: "Huynh Trưởng / Quản Trị Viên",
        tieuDeBaoCao: `File Sao Lưu Dữ Liệu Đoàn Sinh Toàn Diện Năm ${targetYear} (Excel)`,
        tenNguoiGui: "Hệ thống Trung Nam Hub",
        loaiBaoCao: "Sao Lưu Đoàn Sinh",
      },
      attachments: [
        {
          filename: filename,
          content: excelBuffer,
        },
      ],
    }).catch((err) => {
      console.error("❌ Send Member Backup Email Error: ", err);
    });
  }

  return {
    filename,
    buffer: excelBuffer,
  };
};

module.exports = {
  generateMemberReportPDF,
  exportBatchPDF,
  exportBatchAllPDF,
  generateAttendanceQuarterlyReportBundle,
  generateAttendanceAllTimeReportBundle,
  generateMemberFullBackupExcel,
};

