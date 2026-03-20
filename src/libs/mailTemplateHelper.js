import fs from "fs";
import path from "path";

export function renderReportTemplate({
  tenTruongDoan,
  tieuDeBaoCao,
  tenNguoiGui,
  ngayGui,
  loaiBaoCao,
  soLuongFile,
  emailHeThong
}) {
  const templatePath = path.resolve("src/services/mailService/templates/reportMailTemplate.html");
  let html = fs.readFileSync(templatePath, "utf8");

  // Replace all placeholders
  html = html
    .replace(/\[TÊN_TRƯỞNG_ĐOÀN\]/g, tenTruongDoan )
    .replace(/\[TIÊU_ĐỀ_BÁO_CÁO\]/g, tieuDeBaoCao || "Báo cáo đoàn sinh")
    .replace(/\[TÊN_NGƯỜI_GỬI\]/g, tenNguoiGui || "Hệ thống Trung Nam")
    .replace(/\[NGÀY_GỬI\]/g, ngayGui || new Date().toLocaleDateString("vi-VN"))
    .replace(/\[LOẠI_BÁO_CÁO\]/g, loaiBaoCao || "Định kỳ")
    .replace(/\[SỐ_LƯỢNG_FILE\]/g, soLuongFile?.toString() || "1")
    .replace(/\[EMAIL_HỆ_THỐNG\]/g, emailHeThong || "brainiacservicecontact@gmail.com");

  return html;
}
