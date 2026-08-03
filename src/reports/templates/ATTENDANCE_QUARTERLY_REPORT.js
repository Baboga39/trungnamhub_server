const service = require("../../services");

module.exports = {
  id: "ATTENDANCE_QUARTERLY_REPORT",
  name: "Báo cáo Chuyên cần Theo Quý (PDF & Excel)",
  description:
    "Thống kê tổng quan tỷ lệ % chuyên cần, phân loại đoàn sinh và xuất bộ file PDF (Dashboard) & Excel đính kèm gửi Email.",
  icon: "Calendar",
  color: "bg-teal-500",
  category: "Chuyên cần",

  inputs: [
    {
      key: "year",
      label: "Năm học",
      type: "number",
      defaultValue: new Date().getFullYear(),
    },
    {
      key: "quarter",
      label: "Quý",
      type: "select",
      options: [
        { label: "Quý 1", value: 1 },
        { label: "Quý 2", value: 2 },
        { label: "Quý 3", value: 3 },
        { label: "Quý 4", value: 4 },
      ],
    },
    {
      key: "email",
      label: "Người nhận báo cáo",
      type: "select-user",
    },
  ],

  handler: async (parameters, res, user) => {
    const { year, quarter, email } = parameters;

    if (!year || !quarter) {
      return res.status(400).json({
        message: "Thiếu thông số năm hoặc quý báo cáo",
      });
    }

    const zip = await service.reportService.generateAttendanceQuarterlyReportBundle(
      Number(year),
      Number(quarter),
      email,
      user
    );

    const filename = encodeURIComponent(zip.filename);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${filename}`
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    return res.send(zip.buffer);
  },
};
