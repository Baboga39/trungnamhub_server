// src/libs/aiQueryNormalizer.js

/**
 * Từ điển các từ viết tắt, tiếng lóng, teencode và lỗi gõ thiếu dấu tiếng Việt
 * trong ngữ cảnh quản trị Gia Đình Hưng Đạo / Thiếu Nhi Thánh Thể.
 */
const WORD_MAP = {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. TỪ GIAO TIẾP, CÂU HỎI & TRỢ TỪ PHỔ BIẾN
  // ─────────────────────────────────────────────────────────────────────────────
  dc: "được",
  đc: "được",
  dk: "được",
  duoc: "được",
  ko: "không",
  k: "không",
  kh: "không",
  khg: "không",
  khong: "không",
  hok: "không",
  hong: "không",
  hông: "không",
  hổng: "không",
  chua: "chưa",
  ch: "chưa",
  da: "đã",
  nhiu: "nhiều",
  nhìu: "nhiều",
  nhieu: "nhiều",
  it: "ít",
  bn: "bao nhiêu",
  baonhiu: "bao nhiêu",
  baonhieu: "bao nhiêu",
  may: "mấy",
  ntn: "như thế nào",
  nhunao: "như thế nào",
  nhuthenao: "như thế nào",
  j: "gì",
  laj: "là gì",
  lagi: "là gì",
  coj: "có gì",
  cogi: "có gì",
  vs: "với",
  cung: "cùng",
  hoac: "hoặc",
  m: "mình",
  minh: "mình",
  t: "tôi",
  toi: "tôi",
  ng: "người",
  nguoi: "người",
  ae: "anh em",
  odau: "ở đâu",
  lucnao: "lúc nào",
  khinao: "khi nào",
  check: "kiểm tra",
  ktra: "kiểm tra",
  kiemtra: "kiểm tra",
  timkiem: "tìm kiếm",
  coi: "xem",
  soluong: "số lượng",
  tongso: "tổng số",
  tonghop: "tổng hợp",
  baocao: "báo cáo",
  thongke: "thống kê",
  sosanh: "so sánh",
  dsach: "danh sách",
  danhsach: "danh sách",
  bxh: "bảng xếp hạng",
  xephang: "xếp hạng",

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. THUẬT NGỮ TỔ CHỨC, VAI TRÒ & NHÂN SỰ TNTT
  // ─────────────────────────────────────────────────────────────────────────────
  ds: "đoàn sinh",
  đs: "đoàn sinh",
  doansinh: "đoàn sinh",
  hocsinh: "học sinh",
  hs: "học sinh",
  thieunhi: "thiếu nhi",
  auni: "ấu nhi",
  nghiasi: "nghĩa sĩ",
  hiepsi: "hiệp sĩ",
  thanhnien: "thanh niên",
  ht: "huynh trưởng",
  huynhtruong: "huynh trưởng",
  truong: "trưởng",
  trota: "trợ tá",
  bqt: "ban quản trị",
  banquantri: "ban quản trị",
  xdt: "xứ đoàn trưởng",
  xudoantruong: "xứ đoàn trưởng",
  xdp: "xứ đoàn phó",
  xudoanpho: "xứ đoàn phó",
  tuyenuy: "tuyên úy",
  chatuynuy: "cha tuyên úy",
  linhmuc: "linh mục",
  thieutruong: "Thiếu Trưởng",
  thieupho: "Thiếu Phó",
  dongtruong: "Đồng Trưởng",
  dongpho: "Đồng Phó",
  thanhtruong: "Thanh Trưởng",
  thanhpho: "Thanh Phó",
  vuontruong: "Vườn Trưởng",
  chidoantruong: "chi đoàn trưởng",
  doitruong: "đội trưởng",
  chidoan: "chi đoàn",
  phandoan: "phân đoàn",
  nam: "nam",
  nu: "nữ",
  trai: "nam",
  gai: "nữ",

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. TÊN NGÀNH
  // ─────────────────────────────────────────────────────────────────────────────
  nganh: "ngành",
  thieu: "Thiếu",
  dong: "Đồng",
  au: "Đồng",
  thanh: "Thanh",
  nghia: "Thanh",
  hiep: "Thanh",

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. PHÊ DUYỆT, TỜ TRÌNH, TÀI LIỆU & TRẠNG THÁI
  // ─────────────────────────────────────────────────────────────────────────────
  duyet: "duyệt",
  pheduyet: "phê duyệt",
  pduyet: "phê duyệt",
  choaduyet: "chờ duyệt",
  choduyet: "chờ duyệt",
  pending: "chờ duyệt",
  daduyet: "đã duyệt",
  approved: "đã duyệt",
  cansua: "cần sửa",
  chinhsua: "chỉnh sửa",
  needrevision: "cần sửa",
  nhap: "bản nháp",
  draft: "bản nháp",
  guiduyet: "gửi duyệt",
  trinhduyet: "trình duyệt",
  kyduyet: "ký duyệt",
  tuchoi: "từ chối",
  tl: "tài liệu",
  tailieu: "tài liệu",
  tt: "tờ trình",
  totrinh: "tờ trình",
  vanban: "văn bản",
  bieumau: "biểu mẫu",
  quydinh: "quy định",
  noiquy: "nội quy",
  camnang: "cẩm nang",

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. ĐỊA BÀN, GIÁO XỨ, LIÊN LẠC & GIA ĐÌNH
  // ─────────────────────────────────────────────────────────────────────────────
  gx: "giáo xứ",
  giaoxu: "giáo xứ",
  gh: "giáo họ",
  giaoho: "giáo họ",
  xadao: "xã đạo",
  nhatho: "nhà thờ",
  diaban: "địa bàn",
  diachi: "địa chỉ",
  noio: "nơi ở",
  sdt: "số điện thoại",
  dt: "số điện thoại",
  dienthoai: "số điện thoại",
  phone: "số điện thoại",
  tel: "số điện thoại",
  lienhe: "liên hệ",
  lienlac: "liên lạc",
  khancap: "khẩn cấp",
  ph: "phụ huynh",
  phuhuynh: "phụ huynh",
  bome: "bố mẹ",
  bame: "ba mẹ",
  cha: "cha",
  me: "mẹ",
  bo: "bố",
  ba: "ba",

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SINH HOẠT, ĐIỂM DANH & CHUYÊN CẦN
  // ─────────────────────────────────────────────────────────────────────────────
  sh: "sinh hoạt",
  sinhhoat: "sinh hoạt",
  buoish: "buổi sinh hoạt",
  cn: "Chúa Nhật",
  chuanhat: "Chúa Nhật",
  le: "Thánh Lễ",
  dile: "đi lễ",
  thanhle: "Thánh Lễ",
  dd: "điểm danh",
  diemdanh: "điểm danh",
  cc: "chuyên cần",
  chuyencan: "chuyên cần",
  chuoivang: "chuỗi vắng",
  chuoichuyencan: "chuỗi chuyên cần",
  vang: "vắng",
  nghi: "nghỉ",
  nghihoc: "nghỉ học",
  tre: "trễ",
  muon: "muộn",
  cophep: "có phép",
  khongphep: "không phép",
  kphep: "không phép",
  comat: "có mặt",
  hiendien: "hiện diện",

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. HỌC TẬP, GIÁO LÝ, THI ĐUA & ĐIỂM SỐ
  // ─────────────────────────────────────────────────────────────────────────────
  gl: "giáo lý",
  giaoly: "giáo lý",
  nb: "nhân bản",
  nhanban: "nhân bản",
  kn: "kỹ năng",
  kynang: "kỹ năng",
  kinhthanh: "Kinh Thánh",
  diem: "điểm",
  điem: "điểm",
  diemso: "điểm số",
  diemtb: "điểm trung bình",
  dtb: "điểm trung bình",
  heso: "hệ số",
  tongket: "tổng kết",
  thidua: "thi đua",
  xeploai: "xếp loại",
  hocluc: "học lực",
  sx: "xuất sắc",
  xuatsac: "xuất sắc",
  gioi: "giỏi",
  kha: "khá",
  tb: "trung bình",
  trungbinh: "trung bình",
  yeu: "yếu",
  kem: "kém",
  canhbao: "cảnh báo",
  nguyco: "nguy cơ",
  phodiem: "phổ điểm",
  bangvang: "bảng vàng",
  top: "top",

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. CHƯƠNG TRÌNH, BÀI HỌC & GIÁO ÁN
  // ─────────────────────────────────────────────────────────────────────────────
  ct: "chương trình",
  ctrinh: "chương trình",
  ctrn: "chương trình",
  chuongtrinh: "chương trình",
  kh: "kế hoạch",
  kehoach: "kế hoạch",
  bh: "bài học",
  baihoc: "bài học",
  giaoan: "giáo án",
  chude: "chủ đề",
  muctieu: "mục tiêu",
  thoiluong: "thời lượng",
  phut: "phút",
  gio: "giờ",

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. HOẠT ĐỘNG, SỰ KIỆN, PHONG TRÀO & TRẠI
  // ─────────────────────────────────────────────────────────────────────────────
  hd: "hoạt động",
  hoatdong: "hoạt động",
  sk: "sự kiện",
  sukien: "sự kiện",
  pt: "phong trào",
  phongtrao: "phong trào",
  ngoaikhoa: "ngoại khóa",
  camtrai: "cắm trại",
  trai: "trại",
  traihe: "trại hè",
  dangoai: "dã ngoại",
  lehoi: "lễ hội",
  hoithao: "hội thảo",
  vannghe: "văn nghệ",
  thethao: "thể thao",
  bongda: "bóng đá",
  cuocthi: "cuộc thi",

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. SINH NHẬT, NGÀY THÁNG & THỜI GIAN
  // ─────────────────────────────────────────────────────────────────────────────
  sn: "sinh nhật",
  sinhnhat: "sinh nhật",
  ngaysinh: "ngày sinh",
  thangsinh: "tháng sinh",
  namsinh: "năm sinh",
  tuoi: "tuổi",
  tuoimoi: "tuổi mới",
  mungtuoi: "mừng tuổi",
  thoigian: "thời gian",
  tg: "thời gian",
  ngay: "ngày",
  thang: "tháng",
  nam: "năm",
  tuan: "tuần",
  quy: "quý",
  homnay: "hôm nay",
  tuannay: "tuần này",
  tuantoi: "tuần tới",
  tuansau: "tuần sau",
  tuanroi: "tuần rồi",
  thangnay: "tháng này",
  thangsau: "tháng sau",
  quynay: "quý này",
  quysau: "quý sau",
  namnay: "năm nay",
  quakhu: "quá khứ",
  tuonglai: "tương lai",
};

/**
 * Chuẩn hóa câu hỏi đầu vào của người dùng:
 * - Xóa khoảng trắng thừa
 * - Mở rộng các từ viết tắt / tiếng lóng
 * - Tự động phát hiện Quý (q1, q2, q3, q4) và Tháng (t1 - t12)
 *
 * @param {string} rawQuery
 * @returns {string} normalizedQuery
 */
function normalizeUserQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "string") return "";

  let text = rawQuery.trim();

  // Chuẩn hóa Q1, Q2, Q3, Q4, quy 1 -> Quý 1
  text = text.replace(/\bq([1-4])\b/gi, "Quý $1");
  text = text.replace(/\bquy\s*([1-4])\b/gi, "Quý $1");

  // Chuẩn hóa Tháng t1 -> t12 nếu đứng độc lập
  text = text.replace(/\bt(1[0-2]|[1-9])\b/gi, "tháng $1");

  // Tách từ theo khoảng trắng và chuẩn hóa qua từ điển WORD_MAP
  const tokens = text.split(/\s+/).map((tok) => {
    const clean = tok.toLowerCase().replace(/^[.,?!;:'"()]+|[.,?!;:'"()]+$/g, "");
    if (WORD_MAP[clean]) {
      return tok.toLowerCase().replace(clean, WORD_MAP[clean]);
    }
    return tok;
  });

  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

module.exports = {
  normalizeUserQuery,
  WORD_MAP,
};
