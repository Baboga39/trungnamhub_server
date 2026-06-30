const archiver = require("archiver");
const service = require("../../services");

const createZipBuffer = async (files) => {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const buffers = [];

    archive.on("data", (data) => buffers.push(data));
    archive.on("end", () => resolve(Buffer.concat(buffers)));
    archive.on("error", (err) => reject(err));

    for (const file of files) {
      archive.append(file.buffer, { name: file.filename });
    }
    archive.finalize();
  });
};

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
    if (!year || !quarter) {
        return res.status(400).json({ message: "Thiếu thông số báo cáo hàng loạt" });
    }

    const targetEmail = (email && (typeof email === "string" ? email.trim() !== "" : email.length > 0)) ? email : null;

    const files = await service.reportService.exportBatchAllPDF(Number(year), Number(quarter), targetEmail);

    if (!files || files.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy đoàn sinh hoạt động nào để xuất báo cáo" });
    }
    await service.reportService.exportBatchAllPDF(
  Number(year),
  Number(quarter),
  targetEmail
);

return res.ok(
  null,
  targetEmail
    ? "Đã gửi báo cáo hàng loạt qua email thành công!"
    : "Đã tạo báo cáo thành công!"
);

  }
};
