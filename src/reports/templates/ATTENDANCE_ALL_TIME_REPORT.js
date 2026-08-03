const service = require("../../services");

module.exports = {
  id: "ATTENDANCE_ALL_TIME_REPORT",
  name: "Báo cáo Chuyên cần (Tất cả thời gian / Toàn khóa)",
  description:
    "Thống kê tổng hợp toàn bộ lịch sử điểm danh của tất cả đoàn sinh từ trước tới nay. Xuất bộ file PDF & Excel (ZIP) gửi qua Email.",
  icon: "Calendar",
  color: "bg-amber-500",
  category: "Chuyên cần",

  inputs: [
    {
      key: "email",
      label: "Người nhận báo cáo",
      type: "select-user",
    },
  ],

  handler: async (parameters, res, user) => {
    const { email } = parameters;

    const zip = await service.reportService.generateAttendanceAllTimeReportBundle(email, user);

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
