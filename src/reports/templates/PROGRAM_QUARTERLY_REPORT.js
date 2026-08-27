const service = require("../../services");

module.exports = {
  id: "PROGRAM_QUARTERLY_REPORT",
  name: "Báo cáo Chương trình Sinh hoạt (PDF & Excel)",
  description:
    "Thống kê tiến độ thực hiện chương trình sinh hoạt theo Quý, danh mục bài khóa, trưởng phụ trách, sĩ số và đánh giá chất lượng; xuất bộ file PDF & Excel đính kèm (hỗ trợ chọn ngành và nhiều quý gom chung vào file ZIP).",
  icon: "Calendar",
  color: "bg-blue-500",
  category: "Chương trình",

  inputs: [
    {
      key: "branch",
      label: "Chọn Ngành",
      type: "select",
      options: [
        { label: "Tất cả ngành", value: "ALL" },
        { label: "Ngành Đồng", value: "DONG" },
        { label: "Ngành Thiếu", value: "THIEU" },
        { label: "Ngành Thanh", value: "THANH" },
      ],
      defaultValue: "ALL",
    },
    {
      key: "year",
      label: "Năm sinh hoạt",
      type: "number",
      defaultValue: new Date().getFullYear(),
    },
    {
      key: "quarters",
      label: "Chọn các Quý báo cáo",
      type: "multi-select",
      options: [
        { label: "Quý 1", value: 1 },
        { label: "Quý 2", value: 2 },
        { label: "Quý 3", value: 3 },
        { label: "Quý 4", value: 4 },
      ],
      defaultValue: [Math.ceil((new Date().getMonth() + 1) / 3)],
    },
    {
      key: "email",
      label: "Người nhận báo cáo",
      type: "select-user",
    },
  ],

  handler: async (parameters, res, user) => {
    const { branch, year, quarters, quarter, email } = parameters;

    const selectedQuarters = quarters || (quarter ? [quarter] : null);

    if (
      !year ||
      !selectedQuarters ||
      (Array.isArray(selectedQuarters) && selectedQuarters.length === 0)
    ) {
      return res.status(400).json({
        message: "Thiếu thông số năm hoặc quý báo cáo",
      });
    }

    const zip = await service.reportService.generateProgramQuarterlyReportBundle(
      branch || "ALL",
      Number(year),
      selectedQuarters,
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
