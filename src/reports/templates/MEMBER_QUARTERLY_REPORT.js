const service = require("../../services");

module.exports = {
  id: "MEMBER_QUARTERLY_REPORT",
  name: "Báo cáo Đoàn sinh (Cá nhân)",
  description: "Bộ báo cáo thống kê tình hình sinh hoạt, thi đua của một đoàn sinh cụ thể. Kết xuất định dạng PDF và gửi qua Email.",
  icon: "User",
  color: "bg-blue-500",
  inputs: [
    { key: "memberId", label: "Gõ tên hoặc chọn Đoàn sinh", type: "select-member" },
    { key: "year", label: "Năm học", type: "number", defaultValue: new Date().getFullYear() },
    { key: "quarter", label: "Quý", type: "select", options: [
      { label: "Quý 1", value: 1 }, { label: "Quý 2", value: 2 }, { label: "Quý 3", value: 3 }, { label: "Quý 4", value: 4 }
    ]},
    { key: "email", label: "Người nhận báo cáo", type: "select-user" }
  ],
  handler: async (parameters, res) => {
    const { memberId, year, quarter, email } = parameters;
    if (!memberId || !year || !quarter || !email || (Array.isArray(email) && email.length === 0)) {
        return res.status(400).json({ message: "Thiếu thông số báo cáo cá nhân" });
    }
    await service.reportService.exportBatchPDF([Number(memberId)], Number(year), Number(quarter), email);
    return res.ok(null, "Đã xuất và gửi báo cáo thành công!");
  }
};
