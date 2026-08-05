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

  const headerFillColor = "#2f80ed";
  const headerTextColor = "#ffffff";
  const subHeaderColor = "#bfdbfe";
  const titleColor = "#102a43";
  const subtitleColor = "#486581";
  const accentColor = "#2f80ed";
  const softBlue = "#eef6ff";
  const borderColor = "#d9e6f2";

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
      // Header: a calm report cover band with a stable table layout.
      {
        table: {
          widths: [8, "*", 92],
          body: [[
            { text: "", fillColor: accentColor, border: [false, false, false, false] },
            {
              stack: [
                { text: "BÁO CÁO CÁ NHÂN", fontSize: 23, bold: true, color: titleColor },
                { text: "Kết quả rèn luyện và tham gia hoạt động", fontSize: 10, color: subtitleColor, margin: [0, 5, 0, 0] },
              ],
              fillColor: softBlue,
              margin: [18, 15, 10, 15],
              border: [false, false, false, false],
            },
            {
              stack: [
                { text: `QUÝ ${quarter}`, fontSize: 10, bold: true, color: "#ffffff", alignment: "center" },
                { text: String(year), fontSize: 16, bold: true, color: "#ffffff", alignment: "center", margin: [0, 4, 0, 0] },
              ],
              fillColor: accentColor,
              margin: [8, 15, 8, 15],
              border: [false, false, false, false],
            },
          ]],
        },
        layout: "noBorders",
        margin: [0, 0, 0, 18],
      },

      // Member profile and summary metrics
      {
        table: {
          widths: ["38%", "62%"],
          body: [[
            {
              stack: [
                { text: member.name, fontSize: 15, bold: true, color: titleColor, margin: [0, 0, 0, 10] },
                { text: `Ngày sinh: ${formatDate(member.birthDate)}`, fontSize: 10, color: subtitleColor, margin: [0, 3, 0, 3] },
                { text: `Xã đạo: ${member.parish || "-"}`, fontSize: 10, color: subtitleColor, margin: [0, 3, 0, 3] },
                { text: `Năm vào đoàn: ${member.startYear || "-"}`, fontSize: 10, color: subtitleColor, margin: [0, 3, 0, 0] },
              ],
              fillColor: softBlue,
              margin: [14, 14, 10, 14],
              border: [false, false, false, false],
            },
            {
              table: {
                widths: ["*", "*"],
                body: [
                  [
                    {
                      stack: [
                        { text: "Điểm TB", fontSize: 8, color: subtitleColor, alignment: "center", bold: true },
                        { text: score.total.toFixed(2), fontSize: 19, bold: true, color: accentColor, alignment: "center", margin: [0, 5, 0, 0] },
                      ],
                      fillColor: "#ffffff", margin: [8, 14, 8, 14], border: [true, true, true, true], borderColor,
                    },
                    {
                      stack: [
                        { text: "Xếp loại", fontSize: 8, color: subtitleColor, alignment: "center", bold: true },
                        { text: rank, fontSize: 19, bold: true, color: rankColor, alignment: "center", margin: [0, 5, 0, 0] },
                      ],
                      fillColor: "#ffffff", margin: [8, 14, 8, 14], border: [true, true, true, true], borderColor,
                    },
                  ],
                  [
                    {
                      stack: [
                        { text: "Có mặt", fontSize: 8, color: subtitleColor, alignment: "center", bold: true },
                        { text: `${attendance.summary.present}`, fontSize: 19, bold: true, color: "#159570", alignment: "center", margin: [0, 5, 0, 0] },
                      ],
                      fillColor: "#ffffff", margin: [8, 14, 8, 14], border: [true, true, true, true], borderColor,
                    },
                    {
                      stack: [
                        { text: "Hoạt động", fontSize: 8, color: subtitleColor, alignment: "center", bold: true },
                        { text: `${activity.summary.joined}/${activity.summary.total}`, fontSize: 19, bold: true, color: "#d98200", alignment: "center", margin: [0, 5, 0, 0] },
                      ],
                      fillColor: "#ffffff", margin: [8, 14, 8, 14], border: [true, true, true, true], borderColor,
                    },
                  ],
                ],
              },
              layout: "noBorders",
              fillColor: softBlue,
              margin: [8, 8, 8, 8],
              border: [false, false, false, false],
            },
          ]],
        },
        layout: {
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          hLineColor: () => borderColor,
          vLineColor: () => borderColor,
        },
        margin: [0, 0, 0, 22],
      },

      // Chart Section
      { text: "Biểu đồ điểm số chi tiết", fontSize: 13, bold: true, color: titleColor, margin: [0, 0, 0, 10] },
      { image: chartBase64, width: 510, margin: [0, 0, 0, 20], alignment: "center" },

      // Tables
      {
        columns: [
          {
            stack: [
              { text: "Chi tiết điểm", fontSize: 13, bold: true, color: titleColor, margin: [0, 0, 0, 8] },
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
              { text: "Điểm danh", fontSize: 13, bold: true, color: titleColor, margin: [0, 0, 0, 8] },
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
          { text: "Hoạt động tham gia", fontSize: 13, bold: true, color: titleColor, margin: [0, 0, 0, 8] },
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
