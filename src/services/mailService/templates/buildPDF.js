const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const { formatDate } = require("../../../libs/formatDate");
const { getAttendanceText } = require("../../../libs/reportHelper");

const buildChartImage = async (scoreRows) => {
  const labels = scoreRows.map((r) => r.name);
  const data = scoreRows.map((r) => r.score ?? 0);
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 500, height: 200, backgroundColour: "white" });
  return await chartJSNodeCanvas.renderToBuffer({
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: "#3b82f6", borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
};

const attendanceColorMap = { present: "#16a34a", absent: "#dc2626", late: "#f59e0b", excused: "#2563eb" };

const buildPDFDefinition = async (member, score, attendance, activity, year, quarter, rank, rankColor) => {
  const chartBase64 = `data:image/png;base64,${(await buildChartImage(score.rows)).toString("base64")}`;

  const headerFillColor = "#1e40af";
  const headerTextColor = "white";
  const subHeaderColor = "#dbeafe";
  const titleColor = "#0f172a";
  const subtitleColor = "#475569";
  const accentColor = "#2563eb";

  const scoreTableBody = [
    [
      { text: "Môn", bold: true, fontSize: 11, fillColor: headerFillColor, color: headerTextColor, alignment: "center", padding: [8, 4] },
      { text: "Điểm", bold: true, fontSize: 11, fillColor: headerFillColor, color: headerTextColor, alignment: "center", padding: [8, 4] },
      { text: "Hệ số", bold: true, fontSize: 11, fillColor: headerFillColor, color: headerTextColor, alignment: "center", padding: [8, 4] },
      { text: "Quy đổi", bold: true, fontSize: 11, fillColor: headerFillColor, color: headerTextColor, alignment: "center", padding: [8, 4] },
    ],
    ...score.rows.map((r, idx) => [
      { text: r?.name || "", fontSize: 10, alignment: "center", fillColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", padding: [6, 4] },
      { text: r?.score != null ? String(r.score) : "", fontSize: 10, alignment: "center", fillColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", padding: [6, 4] },
      { text: r?.weight != null ? String(r.weight) : "", fontSize: 10, alignment: "center", fillColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", padding: [6, 4] },
      { text: r ? r.weighted.toFixed(1) : "", fontSize: 10, alignment: "center", fillColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", padding: [6, 4], bold: true, color: accentColor },
    ]),
  ];

  const attendanceTableBody = [
    [
      { text: "Ngày", bold: true, fontSize: 11, fillColor: headerFillColor, color: headerTextColor, alignment: "center", padding: [8, 4] },
      { text: "Trạng thái", bold: true, fontSize: 11, fillColor: headerFillColor, color: headerTextColor, alignment: "center", padding: [8, 4] },
      { text: "Ghi chú", bold: true, fontSize: 11, fillColor: headerFillColor, color: headerTextColor, alignment: "center", padding: [8, 4] },
    ],
    ...attendance.list.map((a, idx) => [
      { text: a ? formatDate(a.date) : "", fontSize: 10, alignment: "center", fillColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", padding: [6, 4] },
      { text: a ? getAttendanceText(a.status) : "", fontSize: 10, alignment: "center", fillColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", padding: [6, 4], bold: true, color: a ? (attendanceColorMap[a.status] || "#000") : "#000" },
      { text: a?.note || "", fontSize: 9, alignment: "center", fillColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", padding: [6, 4], color: "#64748b" },
    ]),
  ];

  const activityTableBody = [
    [
      { text: "Tên hoạt động", bold: true, fontSize: 11, fillColor: headerFillColor, color: headerTextColor, alignment: "center", padding: [8, 4] },
      { text: "Ngày", bold: true, fontSize: 11, fillColor: headerFillColor, color: headerTextColor, alignment: "center", padding: [8, 4] },
      { text: "Trạng thái", bold: true, fontSize: 11, fillColor: headerFillColor, color: headerTextColor, alignment: "center", padding: [8, 4] },
    ],
    ...activity.list.map((a, idx) => [
      { text: a?.activity?.name || "", fontSize: 10, alignment: "center", fillColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", padding: [6, 4] },
      { text: a ? formatDate(a.activity.date) : "", fontSize: 10, alignment: "center", fillColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", padding: [6, 4] },
      { text: a?.status || "", fontSize: 10, alignment: "center", fillColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc", padding: [6, 4], bold: true, color: accentColor },
    ]),
  ];

  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 50],
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: "Hệ thống quản lý đoàn sinh", fontSize: 9, color: "#94a3b8" },
        { text: "Báo cáo học kỳ - Quarterly Report", fontSize: 9, color: "#94a3b8", alignment: "center" },
        { text: `Trang ${currentPage}/${pageCount}  •  ${new Date().toLocaleDateString("vi-VN")}`, fontSize: 9, color: "#94a3b8", alignment: "right" },
      ],
      margin: [40, 10, 40, 10],
    }),
    content: [
      // Header
      {
        columns: [
          {
            width: 8,
            canvas: [
              { type: "rect", x: 0, y: 0, w: 8, h: 60, fillOpacity: 1, color: accentColor },
            ],
          },
          {
            stack: [
              { text: `BÁO CÁO ĐỊA VỊ`, fontSize: 28, bold: true, color: titleColor },
              { text: `Quý ${quarter}/${year}`, fontSize: 14, color: accentColor, margin: [0, 4, 0, 0] },
            ],
            margin: [16, 8, 0, 8],
          },
        ],
        columnGap: 0,
        margin: [0, 0, 0, 24],
        fillColor: "#ffffff",
      },

      // Member Info & Stats
      {
        columns: [
          {
            stack: [
              { text: member.name, fontSize: 16, bold: true, color: titleColor, margin: [0, 0, 0, 10] },
              {
                stack: [
                  { text: `📅 Ngày sinh: ${formatDate(member.birthDate)}`, fontSize: 11, color: subtitleColor, margin: [0, 4, 0, 4] },
                  { text: `📍 Xã đạo: ${member.parish || "-"}`, fontSize: 11, color: subtitleColor, margin: [0, 4, 0, 4] },
                  { text: `🎓 Năm vào đoàn: ${member.startYear || "-"}`, fontSize: 11, color: subtitleColor, margin: [0, 4, 0, 0] },
                ],
              },
            ],
            width: "45%",
          },
          {
            columns: [
              {
                stack: [
                  { text: "Điểm TB", fontSize: 9, color: subtitleColor, alignment: "center", bold: true },
                  { text: score.total.toFixed(2), fontSize: 18, bold: true, color: accentColor, alignment: "center", margin: [0, 4, 0, 0] },
                ],
                width: "*",
                border: [0, 0, 1, 0],
                borderColor: "#e2e8f0",
              },
              {
                stack: [
                  { text: "Xếp loại", fontSize: 9, color: subtitleColor, alignment: "center", bold: true },
                  { text: rank, fontSize: 18, bold: true, color: rankColor, alignment: "center", margin: [0, 4, 0, 0] },
                ],
                width: "*",
                border: [0, 0, 1, 0],
                borderColor: "#e2e8f0",
              },
              {
                stack: [
                  { text: "Có mặt", fontSize: 9, color: subtitleColor, alignment: "center", bold: true },
                  { text: `${attendance.summary.present}`, fontSize: 18, bold: true, color: "#16a34a", alignment: "center", margin: [0, 4, 0, 0] },
                ],
                width: "*",
                border: [0, 0, 1, 0],
                borderColor: "#e2e8f0",
              },
              {
                stack: [
                  { text: "Hoạt động", fontSize: 9, color: subtitleColor, alignment: "center", bold: true },
                  { text: `${activity.summary.joined}/${activity.summary.total}`, fontSize: 18, bold: true, color: "#f59e0b", alignment: "center", margin: [0, 4, 0, 0] },
                ],
                width: "*",
              },
            ],
            columnGap: 0,
            width: "55%",
          },
        ],
        columnGap: 20,
        margin: [0, 0, 0, 20],
      },

      // Chart Section
      { text: "📊 Biểu đồ điểm số chi tiết", fontSize: 13, bold: true, color: titleColor, margin: [0, 0, 0, 10] },
      { image: chartBase64, width: 510, margin: [0, 0, 0, 20], alignment: "center" },

      // Tables
      {
        columns: [
          {
            stack: [
              { text: "📋 Chi tiết điểm", fontSize: 13, bold: true, color: titleColor, margin: [0, 0, 0, 8] },
              {
                table: {
                  headerRows: 1,
                  widths: ["*", "auto", "auto", "auto"],
                  body: scoreTableBody,
                  dontBreakRows: false,
                },
                layout: {
                  hLineWidth: (i) => i === 0 ? 2 : 0.5,
                  hLineColor: (i) => i === 0 ? headerFillColor : "#e2e8f0",
                  vLineWidth: () => 0.5,
                  vLineColor: () => "#e2e8f0",
                  paddingLeft: () => 4,
                  paddingRight: () => 4,
                },
              },
            ],
            width: "48%",
          },
          {
            stack: [
              { text: "✓ Điểm danh", fontSize: 13, bold: true, color: titleColor, margin: [0, 0, 0, 8] },
              {
                table: {
                  headerRows: 1,
                  widths: ["auto", "auto", "*"],
                  body: attendanceTableBody,
                  dontBreakRows: false,
                },
                layout: {
                  hLineWidth: (i) => i === 0 ? 2 : 0.5,
                  hLineColor: (i) => i === 0 ? headerFillColor : "#e2e8f0",
                  vLineWidth: () => 0.5,
                  vLineColor: () => "#e2e8f0",
                  paddingLeft: () => 4,
                  paddingRight: () => 4,
                },
              },
            ],
            width: "52%",
          },
        ],
        columnGap: 15,
        margin: [0, 0, 0, 20],
      },

      // Activities Section
      {
        pageBreak: "before",
        stack: [
          { text: "🎯 Hoạt động tham gia", fontSize: 13, bold: true, color: titleColor, margin: [0, 0, 0, 8] },
          {
            table: {
              headerRows: 1,
              widths: ["*", "auto", "auto"],
              body: activityTableBody,
              dontBreakRows: false,
            },
            layout: {
              hLineWidth: (i) => i === 0 ? 2 : 0.5,
              hLineColor: (i) => i === 0 ? headerFillColor : "#e2e8f0",
              vLineWidth: () => 0.5,
              vLineColor: () => "#e2e8f0",
              paddingLeft: () => 4,
              paddingRight: () => 4,
            },
          },
        ],
      },
    ],
    defaultStyle: { font: "Roboto", lineHeight: 1.4 },
  };
};

module.exports = buildPDFDefinition;
