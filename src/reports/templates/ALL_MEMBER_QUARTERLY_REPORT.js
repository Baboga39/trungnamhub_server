const service = require("../../services");

module.exports = {
  id: "ALL_MEMBER_QUARTERLY_REPORT",
  name: "Báo cáo Đoàn sinh (Hàng loạt)",
  description:
    "Tự động kết xuất và gửi báo cáo PDF hàng loạt cho tất cả đoàn sinh đang hoạt động.",
  icon: "Users",
  color: "bg-purple-500",

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
      label: "Quản trị viên nhận thông báo",
      type: "select-user",
    },
  ],

  handler: async (parameters, res) => {
    const { year, quarter, email } = parameters;

    const zip = await service.reportService.exportBatchAllPDF(
      Number(year),
      Number(quarter),
      email
    );

    res.setHeader("Content-Type", "application/zip");
res.setHeader("Content-Type", "application/zip");

res.setHeader(
  "Content-Disposition",
  `attachment; filename*=UTF-8''${encodeURIComponent(zip.filename)}`
);

res.setHeader(
  "Access-Control-Expose-Headers",
  "Content-Disposition"
);

return res.send(zip.buffer);
  },
};