const service = require("../../services");

module.exports = {
  id: "ALL_MEMBER_QUARTERLY_REPORT",
  name: "Báo cáo Đoàn sinh (Hàng loạt)",
  description: "Tự động kết xuất và gửi báo cáo PDF hàng loạt cho TẤT CẢ đoàn sinh đang hoạt động.",
  icon: "Users",
  color: "bg-purple-500",
  inputs: [
    { key: "year", label: "Năm học", type: "number", defaultValue: new Date().getFullYear() },
    { key: "quarter", label: "Quý", type: "select", options: [
      { label: "Quý 1", value: 1 }, { label: "Quý 2", value: 2 }, { label: "Quý 3", value: 3 }, { label: "Quý 4", value: 4 }
    ]},
    { key: "email", label: "Quản trị viên nhận thông báo", type: "select-user" }
  ],
  handler: async (parameters, res) => {
    const { year, quarter, email } = parameters;
    if (!year || !quarter || !email || (Array.isArray(email) && email.length === 0)) {
        return res.status(400).json({ message: "Thiếu thông số báo cáo hàng loạt" });
    }
    await service.reportService.exportBatchAllPDF(Number(year), Number(quarter), email);
    return res.ok(null, "Đã xuất báo cáo hàng loạt thành công!");
  }
};
