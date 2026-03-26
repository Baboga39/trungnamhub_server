import { sendReportMail } from "./mailService.js";

sendReportMail({
  to: "phannhung05121999@gmail.com",
  tenTruongDoan: "Anh Nam",
  tenDoanSinh: "Nguyễn Minh Trung",
  tieuDe: "Báo cáo tuần 41",
  ngayGui: "10/10/2025",
  loaiBaoCao: "Báo cáo hoạt động",
  files: [
    { name: "BaoCaoHoatDong.pdf", size: "1.2 MB", link: "https://example.com/file1" },
    { name: "ThongKe.xlsx", size: "520 KB", link: "https://example.com/file2" },
  ],
});