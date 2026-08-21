const service = require("../../services");

module.exports = {
  id: "MEMBER_FULL_BACKUP_REPORT",
  name: "Sao Lưu Dữ Liệu Đoàn Sinh Toàn Diện (Excel)",
  description:
    "Xuất file Excel sao lưu 4 sheet đầy đủ: Hồ sơ lý lịch cá nhân, Tổng hợp chuyên cần, Bảng điểm chi tiết 4 quý, và Lịch sử tham gia hoạt động ngoại khóa.",
  icon: "Users",
  color: "bg-green-500",
  category: "Đoàn sinh",

  inputs: [
    {
      key: "year",
      label: "Năm học cần sao lưu",
      type: "number",
      defaultValue: new Date().getFullYear(),
    },
    {
      key: "email",
      label: "Người nhận file sao lưu qua email",
      type: "select-user",
    },
  ],

  handler: async (parameters, res, user) => {
    const { year, email } = parameters;

    const file = await service.reportService.generateMemberFullBackupExcel(
      Number(year) || new Date().getFullYear(),
      email,
      user
    );

    const filename = encodeURIComponent(file.filename);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${filename}`
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

    return res.send(file.buffer);
  },
};
