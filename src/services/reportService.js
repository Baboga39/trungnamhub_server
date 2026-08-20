
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

const generateAttendanceQuarterlyExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hệ thống Trung Nam";
  workbook.created = new Date();

  // Sheet 1: Tổng quan
  const summarySheet = workbook.addWorksheet("Tổng quan & Thống kê");

  summarySheet.mergeCells("A1:E1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = `BÁO CÁO THỐNG KÊ CHUYÊN CẦN QUÝ ${data.quarter} NĂM ${data.year}`;
  titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FF1E3A8A" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  summarySheet.getRow(1).height = 35;

  summarySheet.addRow([]);

  summarySheet.mergeCells("A3:E3");
  const section1 = summarySheet.getCell("A3");
  section1.value = "I. BẢNG CHỈ SỐ TỔNG QUAN";
  section1.font = { name: "Arial", size: 12, bold: true, color: { argb: "FF1F2937" } };

  summarySheet.addRow(["Chỉ số", "Giá trị"]);
  summarySheet.addRow(["Tổng số buổi sinh hoạt trong Quý", data.totalSessions]);
  summarySheet.addRow(["Tổng số đoàn sinh hoạt động", data.totalMembers]);
  summarySheet.addRow(["Tỷ lệ Chuyên cần Trung bình Toàn Đoàn", `${data.overallRatePercent}%`]);

  summarySheet.addRow([]);

  summarySheet.mergeCells("A9:E9");
  const section2 = summarySheet.getCell("A9");
  section2.value = "II. PHÂN LOẠI MỨC ĐỘ CHUYÊN CẦN";
  section2.font = { name: "Arial", size: 12, bold: true, color: { argb: "FF1F2937" } };

  summarySheet.addRow(["Mức xếp loại", "Tỷ lệ % quy định", "Số lượng đoàn sinh", "Tỷ lệ chiếm"]);
  summarySheet.addRow(["Tuyên dương (Xuất sắc)", ">= 90%", data.ratingSummary.tuyenDuong, `${((data.ratingSummary.tuyenDuong / (data.totalMembers || 1)) * 100).toFixed(1)}%`]);
  summarySheet.addRow(["Tốt / Đạt", "75% - 89.9%", data.ratingSummary.tot, `${((data.ratingSummary.tot / (data.totalMembers || 1)) * 100).toFixed(1)}%`]);
  summarySheet.addRow(["Cần nhắc nhở", "50% - 74.9%", data.ratingSummary.nhacNho, `${((data.ratingSummary.nhacNho / (data.totalMembers || 1)) * 100).toFixed(1)}%`]);
  summarySheet.addRow(["Báo động", "< 50%", data.ratingSummary.baoDong, `${((data.ratingSummary.baoDong / (data.totalMembers || 1)) * 100).toFixed(1)}%`]);

  [4, 10].forEach((rowNum) => {
    const row = summarySheet.getRow(rowNum);
    row.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
  });

  summarySheet.columns = [
    { width: 35 },
    { width: 25 },
    { width: 22 },
    { width: 18 },
    { width: 15 },
  ];

  // Sheet 2: Chi tiết
  const detailSheet = workbook.addWorksheet("Chi tiết Đoàn sinh");

  detailSheet.mergeCells("A1:J1");
  const detailTitle = detailSheet.getCell("A1");
  detailTitle.value = `DANH SÁCH CHI TIẾT CHUYÊN CẦN QUÝ ${data.quarter} NĂM ${data.year}`;
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

  headerRow.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.height = 25;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  data.members.forEach((m, idx) => {
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

    row.alignment = { vertical: "middle" };
    row.getCell(1).alignment = { horizontal: "center" };
    row.getCell(4).alignment = { horizontal: "center" };
    row.getCell(5).alignment = { horizontal: "center" };
    row.getCell(6).alignment = { horizontal: "center" };
    row.getCell(7).alignment = { horizontal: "center" };
    row.getCell(8).alignment = { horizontal: "center" };
    row.getCell(9).alignment = { horizontal: "center" };
    row.getCell(10).alignment = { horizontal: "center" };

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
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

  return workbook.xlsx.writeBuffer();
};

const generateAttendanceQuarterlyPDF = async (data) => {
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

  data.members.forEach((m, idx) => {
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

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [30, 30, 30, 30],
    content: [
      { text: "HỆ THỐNG QUẢN LÝ TRUNG NAM HUB", style: "subHeader" },
      {
        text: `BÁO CÁO THỐNG KÊ CHUYÊN CẦN QUÝ ${data.quarter} / NĂM ${data.year}`,
        style: "mainHeader",
      },
      {
        text: `Ngày kết xuất: ${new Date().toLocaleDateString("vi-VN")}`,
        style: "dateText",
      },

      { text: "\n" },

      {
        table: {
          widths: ["25%", "25%", "25%", "25%"],
          body: [
            [
              {
                fillColor: "#F3F4F6",
                text: [
                  { text: "Tổng số buổi\n", fontSize: 9, color: "#6B7280" },
                  { text: `${data.totalSessions} buổi`, fontSize: 13, bold: true, color: "#1F2937" },
                ],
                alignment: "center",
                margin: [5, 8, 5, 8],
              },
              {
                fillColor: "#F3F4F6",
                text: [
                  { text: "Số đoàn sinh\n", fontSize: 9, color: "#6B7280" },
                  { text: `${data.totalMembers} em`, fontSize: 13, bold: true, color: "#1F2937" },
                ],
                alignment: "center",
                margin: [5, 8, 5, 8],
              },
              {
                fillColor: "#E0F2FE",
                text: [
                  { text: "% Chuyên cần chung\n", fontSize: 9, color: "#0369A1" },
                  { text: `${data.overallRatePercent}%`, fontSize: 13, bold: true, color: "#0284C7" },
                ],
                alignment: "center",
                margin: [5, 8, 5, 8],
              },
              {
                fillColor: "#DCFCE7",
                text: [
                  { text: "Tuyên dương (>=90%)\n", fontSize: 9, color: "#15803D" },
                  { text: `${data.ratingSummary.tuyenDuong} em`, fontSize: 13, bold: true, color: "#16A34A" },
                ],
                alignment: "center",
                margin: [5, 8, 5, 8],
              },
            ],
          ],
        },
        layout: "noBorders",
      },

      { text: "\n" },

      { text: "DANH SÁCH CHI TIẾT CHUYÊN CẦN ĐOÀN SINH", style: "sectionHeader" },
      { text: "\n" },

      {
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
      },
    ],

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

const generateAttendanceQuarterlyReportBundle = async (year, quarter, email, user) => {
  const data = await getAttendanceQuarterlyData(year, quarter, user);

  const [pdfBuffer, excelBuffer] = await Promise.all([
    generateAttendanceQuarterlyPDF(data),
    generateAttendanceQuarterlyExcel(data),
  ]);

  const pdfFilename = `BaoCaoChuyenCan_Q${quarter}_${year}.pdf`;
  const excelFilename = `BaoCaoChuyenCan_Q${quarter}_${year}.xlsx`;
  const zipFilename = `BaoCaoChuyenCan_Q${quarter}_${year}.zip`;

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
        tieuDeBaoCao: `Báo cáo Chuyên cần Quý ${quarter}/${year} (PDF & Excel)`,
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


module.exports = {
  generateMemberReportPDF,
  exportBatchPDF,
  exportBatchAllPDF,
  generateAttendanceQuarterlyReportBundle,
  generateAttendanceAllTimeReportBundle,
};
