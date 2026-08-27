// src/libs/aiQueryNormalizer.js
const prisma = require("./prisma");

/**
 * Hàm loại bỏ dấu tiếng Việt để so khớp không dấu
 */
function removeVietnameseTones(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/**
 * Từ điển tĩnh siêu mở rộng (Static Dictionary)
 */
const WORD_MAP = {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. TỪ GIAO TIẾP, CÂU HỎI, TRỢ TỪ & ĐẠI TỪ NHÂN XƯNG
  // ─────────────────────────────────────────────────────────────────────────────
  thong: "thông",
  tin: "tin",
  thongtin: "thông tin",
  moi: "mới",
  len: "lên",
  mon: "môn",
  monhoc: "môn học",
  h: "giờ",
  gio: "giờ",
  hien: "hiện",
  hientai: "hiện tại",
  hnay: "hôm nay",
  homnay: "hôm nay",
  bjo: "bây giờ",
  baygio: "bây giờ",
  bgio: "bây giờ",
  cua: "của",
  ban: "bạn",
  b: "bạn",
  la: "là",
  con: "còn",
  co: "có",
  cac: "các",
  nhung: "những",
  va: "và",
  hoac: "hoặc",
  cung: "cùng",
  voi: "với",
  vs: "với",
  nhat: "nhất",
  nhatla: "nhất là",
  doan: "đoàn",
  toan: "toàn",
  tatca: "tất cả",
  het: "hết",
  ca: "cả",
  cho: "cho",
  biet: "biết",
  hoi: "hỏi",
  chohoi: "cho hỏi",
  chobiett: "cho biết",
  chobiet: "cho biết",
  xin: "xin",
  xinhoi: "xin hỏi",
  alo: "xin chào",
  hi: "xin chào",
  hello: "xin chào",
  chao: "chào",
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
  hém: "không",
  hem: "không",
  kô: "không",
  chua: "chưa",
  ch: "chưa",
  da: "đã",
  dang: "đang",
  se: "sẽ",
  roi: "rồi",
  r: "rồi",
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
  sao: "sao",
  the: "thế",
  thela: "thế là",
  thenao: "thế nào",
  visao: "vì sao",
  taisao: "tại sao",
  tai: "tại",
  j: "gì",
  gi: "gì",
  caij: "cái gì",
  caigi: "cái gì",
  laj: "là gì",
  lagi: "là gì",
  coj: "có gì",
  cogi: "có gì",
  m: "mình",
  minh: "mình",
  t: "tôi",
  toi: "tôi",
  e: "em",
  em: "em",
  a: "anh",
  anh: "anh",
  c: "chị",
  chi: "chị",
  ng: "người",
  nguoi: "người",
  ai: "ai",
  laai: "là ai",
  ailai: "ai là",
  nhungai: "những ai",
  coai: "có ai",
  ae: "anh em",
  odau: "ở đâu",
  o: "ở",
  dau: "đâu",
  day: "đây",
  do: "đó",
  nay: "này",
  kia: "kia",
  lucnao: "lúc nào",
  khinao: "khi nào",
  baoio: "bao giờ",
  baogio: "bao giờ",
  check: "kiểm tra",
  ktra: "kiểm tra",
  kiemtra: "kiểm tra",
  kt: "kiểm tra",
  timkiem: "tìm kiếm",
  tim: "tìm",
  kiem: "kiếm",
  tra: "tra cứu",
  tracuu: "tra cứu",
  coi: "xem",
  xem: "xem",
  show: "hiển thị",
  hienthi: "hiển thị",
  xuat: "xuất",
  in: "in",
  soluong: "số lượng",
  tongso: "tổng số",
  tong: "tổng",
  tonghop: "tổng hợp",
  baocao: "báo cáo",
  bc: "báo cáo",
  bcao: "báo cáo",
  thongke: "thống kê",
  tk: "thống kê",
  tke: "thống kê",
  sosanh: "so sánh",
  danhgia: "đánh giá",
  dsach: "danh sách",
  danhsach: "danh sách",
  ds: "danh sách",
  bxh: "bảng xếp hạng",
  xephang: "xếp hạng",
  top: "top",

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. THUẬT NGỮ TỔ CHỨC, VAI TRÒ & NHÂN SỰ GIA ĐÌNH HƯNG ĐẠO / TNTT
  // ─────────────────────────────────────────────────────────────────────────────
  doansinh: "đoàn sinh",
  đs: "đoàn sinh",
  hocsinh: "học sinh",
  hs: "học sinh",
  thieunhi: "thiếu nhi",
  auni: "ấu nhi",
  nghiasi: "nghĩa sĩ",
  hiepsi: "hiệp sĩ",
  thanhnien: "thanh niên",
  ht: "trưởng",
  huynhtruong: "trưởng",
  huynhtr: "trưởng",
  truong: "trưởng",
  trota: "trợ tá",
  bqt: "ban quản trị",
  banquantri: "ban quản trị",
  bhd: "ban hướng dẫn",
  banhuongdan: "ban hướng dẫn",
  trbhd: "trưởng ban hướng dẫn",
  truongbanhuongdan: "trưởng ban hướng dẫn",
  xdt: "Gia Đình Hưng Đạo trưởng",
  xudoantruong: "Gia Đình Hưng Đạo trưởng",
  xdp: "Gia Đình Hưng Đạo phó",
  xudoanpho: "Gia Đình Hưng Đạo phó",
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
  toantruong: "toán trưởng",
  chidoan: "chi đoàn",
  phandoan: "phân đoàn",
  toan: "toán",
  hangdoi: "hàng đội",
  doinhom: "đội nhóm",
  nam: "nam",
  nu: "nữ",
  trai: "nam",
  gai: "nữ",
  gioitinh: "giới tính",

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. TÊN NGÀNH & ĐỘI NHÓM
  // ─────────────────────────────────────────────────────────────────────────────
  nganh: "ngành",
  thieu: "Thiếu",
  nganhthieu: "ngành Thiếu",
  dong: "Đồng",
  nganhdong: "ngành Đồng",
  au: "Đồng",
  nganhau: "ngành Đồng",
  thanh: "Thanh",
  nganhthanh: "ngành Thanh",
  nghia: "Thanh",
  hiep: "Thanh",
  vuon: "Vườn",
  nganhvuon: "ngành Vườn",

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
  // 5. ĐỊA BÀN, XÃ ĐẠO, HỌ ĐẠO, NHÀ THỜ & LIÊN LẠC GIA ĐÌNH
  // ─────────────────────────────────────────────────────────────────────────────
  gx: "Xã đạo",
  giaoxu: "Xã đạo",
  xadao: "Xã đạo",
  xa: "xã",
  dao: "đạo",
  gh: "Họ Đạo",
  giaoho: "Họ Đạo",
  hodao: "Họ Đạo",
  nhatho: "nhà thờ",
  diaban: "địa bàn",
  diachi: "địa chỉ",
  noio: "nơi ở",
  phuoc: "Phước",
  phuocle: "Phước Lễ",
  phuocnguyen: "Phước Nguyên",
  longkien: "Long Kiên",
  quangthanh: "Quảng Thành",
  trungnam: "Trung Nam",
  binhba: "Bình Ba",
  vinhan: "Vĩnh An",
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
  anhchi: "anh chị",
  anhce: "anh chị em",
  anhchiem: "anh chị em",
  anhruot: "anh ruột",
  chiruot: "chị ruột",
  emruot: "em ruột",
  giadinh: "gia đình",
  suckhoe: "sức khỏe",
  hoanthien: "hoàn thiện",
  mucdo: "mức độ",

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SINH HOẠT, ĐIỂM DANH, CHUYÊN CẦN & CHUỖI VẮNG
  // ─────────────────────────────────────────────────────────────────────────────
  sh: "sinh hoạt",
  sinhhoat: "sinh hoạt",
  buoish: "buổi sinh hoạt",
  buoi: "buổi",
  cn: "Chúa Nhật",
  chuanhat: "Chúa Nhật",
  le: "Lễ",
  dile: "đi lễ",
  thanhle: "Thánh Lễ",
  dd: "điểm danh",
  diemdanh: "điểm danh",
  cc: "chuyên cần",
  chuyencan: "chuyên cần",
  streak: "chuỗi chuyên cần",
  chuoivang: "chuỗi vắng",
  chuoicc: "chuỗi chuyên cần",
  chuoichuyencan: "chuỗi chuyên cần",
  vang: "vắng",
  nghi: "nghỉ",
  nghihoc: "nghỉ học",
  vangmat: "vắng mặt",
  vangnhieu: "vắng nhiều",
  tre: "trễ",
  muon: "muộn",
  cophep: "có phép",
  khongphep: "không phép",
  kphep: "không phép",
  comat: "có mặt",
  hiendien: "hiện diện",
  cmat: "có mặt",
  kmat: "không có mặt",
  lienke: "liên tiếp",
  lientiep: "liên tiếp",

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. HỌC TẬP, GIÁO LÝ, THI ĐUA, ĐIỂM SỐ & BẢNG VÀNG
  // ─────────────────────────────────────────────────────────────────────────────
  gl: "giáo lý",
  giaoly: "giáo lý",
  nb: "nhân bản",
  nhanban: "nhân bản",
  kn: "kỹ năng",
  kynang: "kỹ năng",
  kinhthanh: "Kinh Thánh",
  glhe: "Giáo lý Hè",
  giaolyhe: "Giáo lý Hè",
  kienthuc: "Kiến thức",
  diem: "điểm",
  điem: "điểm",
  diemso: "điểm số",
  diemtb: "điểm trung bình",
  dtb: "điểm trung bình",
  heso: "hệ số",
  trongso: "trọng số",
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
  diemliet: "điểm liệt",
  canhbao: "cảnh báo",
  nguyco: "nguy cơ",
  phodiem: "phổ điểm",
  bangvang: "bảng vàng",
  lechdiem: "lệch điểm",
  batthuong: "bất thường",

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. CHƯƠNG TRÌNH, BÀI HỌC, GIÁO ÁN & TÀI LIỆU
  // ─────────────────────────────────────────────────────────────────────────────
  ct: "chương trình",
  ctrinh: "chương trình",
  ctrn: "chương trình",
  chuongtrinh: "chương trình",
  ctsh: "chương trình sinh hoạt",
  kh: "kế hoạch",
  kehoach: "kế hoạch",
  bh: "bài học",
  baihoc: "bài học",
  giaoan: "giáo án",
  sansang: "sẵn sàng",
  chuanbi: "chuẩn bị",
  chude: "chủ đề",
  muctieu: "mục tiêu",
  thoiluong: "thời lượng",
  phut: "phút",
  gio: "giờ",
  file: "file",
  dinhkem: "đính kèm",
  tailieudinhkem: "tài liệu đính kèm",
  excel: "file Excel",
  pdf: "file PDF",
  word: "file Word",
  diadiem: "địa điểm",
  baoanduong: "Báo Ân Đường",
  traiduong: "Trai Đường",

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. SỰ KIỆN, PHONG TRÀO, NGOẠI KHÓA, TRẠI & LỄ BỔN MẠNG
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
  bonmang: "bổn mạng",
  lebonmang: "Lễ Bổn Mạng",
  quanthay: "quan thầy",
  lequanthay: "Lễ Quan Thầy",
  thangcap: "thăng cấp",
  thangnganh: "thăng ngành",
  lennganh: "lên ngành",
  chuyennganh: "chuyển ngành",
  moigianhap: "mới gia nhập",
  moivaodoan: "mới vào đoàn",

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
  thangroi: "tháng rồi",
  quynay: "quý này",
  quysau: "quý sau",
  quyroi: "quý rồi",
  namnay: "năm nay",
  namsau: "năm sau",
  namngoai: "năm ngoái",
  quakhu: "quá khứ",
  tuonglai: "tương lai",
};

/**
 * Bộ nhớ đệm động (Dynamic In-Memory Entity Map) nạp tự động từ Database
 */
let dynamicDbEntityMap = new Map();
let lastDbSyncTime = 0;
const DB_SYNC_INTERVAL_MS = 5 * 60 * 1000; // Cập nhật lại mỗi 5 phút

/**
 * Nạp từ vựng thực tế từ Database (Tên đoàn sinh, tên trưởng, Họ Đạo, Xã đạo, Chi đoàn, Môn học, Địa điểm)
 */
async function refreshDynamicDbEntities() {
  const now = Date.now();
  if (now - lastDbSyncTime < DB_SYNC_INTERVAL_MS && dynamicDbEntityMap.size > 0) {
    return;
  }

  try {
    const [members, users, gradeCategories] = await Promise.all([
      prisma.member.findMany({ select: { name: true, parish: true, church: true, group: true } }),
      prisma.user.findMany({ select: { name: true } }),
      prisma.gradeCategory.findMany({ select: { name: true } }),
    ]);

    const rawEntities = [
      "Trung Nam",
      "Gia Đình Hưng Đạo",
      "Ban Hướng Dẫn",
      "Ban Quản Trị",
      "Phước Lễ",
      "Phước Nguyên",
      "Phước Minh",
      "Phước Mỹ",
      "Phước Hòa",
      "Long Kiên",
      "Quảng Thành",
      "Bình Ba",
      "Vĩnh An",
      "Báo Ân Đường",
      "Trai Đường",
      "Mẫu Đơn",
      "Đỗ Quyên",
      ...members.map((m) => m.name),
      ...users.map((u) => u.name),
      ...members.map((m) => m.parish),
      ...members.map((m) => m.church),
      ...members.map((m) => m.group),
      ...gradeCategories.map((c) => c.name),
    ].filter((e) => e && e !== "-" && !e.includes("Chưa biết"));

    const newMap = new Map();
    // Ưu tiên tên dài hơn khớp trước (longest match first)
    const uniqueEntities = [...new Set(rawEntities)].sort((a, b) => b.length - a.length);

    uniqueEntities.forEach((name) => {
      const unaccented = removeVietnameseTones(name);
      if (unaccented && unaccented.length >= 3) {
        newMap.set(unaccented, name);
      }
      // Bổ sung tên gọi 2 từ cuối (ví dụ: 'cam tu' cho 'Nguyễn Lê Cẩm Tú')
      const words = name.split(/\s+/);
      if (words.length >= 2) {
        const shortName = words.slice(-2).join(" ");
        const shortUnacc = removeVietnameseTones(shortName);
        if (shortUnacc && shortUnacc.length >= 3 && !newMap.has(shortUnacc)) {
          newMap.set(shortUnacc, shortName);
        }
      }
    });

    dynamicDbEntityMap = newMap;
    lastDbSyncTime = now;
  } catch (err) {
    console.warn("⚠️ [Normalizer] Không thể tải dữ liệu thực tế từ DB để chuẩn hóa:", err.message);
  }
}

// Khởi động nạp trước lần đầu
refreshDynamicDbEntities().catch(() => {});

/**
 * Chuẩn hóa câu hỏi đầu vào của người dùng kết hợp Từ điển Tĩnh và Dữ liệu Động DB:
 *
 * @param {string} rawQuery
 * @returns {string} normalizedQuery
 */
function normalizeUserQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "string") return "";

  // Tự động kích hoạt nạp lại DB ngầm nếu đã quá hạn
  refreshDynamicDbEntities().catch(() => {});

  let text = rawQuery.trim();

  // 1. Chuẩn hóa Quý (Q1, Q2, Q3, Q4, quy 1, q 1 -> Quý 1)
  text = text.replace(/\bq\s*([1-4])\b/gi, "Quý $1");
  text = text.replace(/\bquy\s*([1-4])\b/gi, "Quý $1");

  // 2. Chuẩn hóa Tháng (t1 -> t12, thg 1 -> tháng 1)
  text = text.replace(/\bthg\s*(1[0-2]|[1-9])\b/gi, "tháng $1");
  text = text.replace(/\bt(1[0-2]|[1-9])\b/gi, "tháng $1");

  // 3. Khớp và bảo vệ thực thể động từ Database (Database-driven Entity Protection)
  const dbPlaceholders = [];
  let pIdx = 0;

  if (dynamicDbEntityMap.size > 0) {
    for (const [unacc, official] of dynamicDbEntityMap.entries()) {
      const escaped = unacc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const reg = new RegExp("\\b" + escaped + "\\b", "gi");
      if (reg.test(text)) {
        const ph = `__DB_ENT_${pIdx++}__`;
        dbPlaceholders.push({ ph, official });
        text = text.replace(reg, ph);
      }
    }
  }

  // 4. Chuẩn hóa qua từ điển tĩnh WORD_MAP
  const tokens = text.split(/\s+/).map((tok) => {
    const clean = tok.toLowerCase().replace(/^[.,?!;:'"()]+|[.,?!;:'"()]+$/g, "");
    if (WORD_MAP[clean]) {
      return tok.toLowerCase().replace(clean, WORD_MAP[clean]);
    }
    return tok;
  });

  let normalized = tokens.join(" ").replace(/\s+/g, " ").trim();

  // 5. Khôi phục lại các thực thể chính xác từ Database
  dbPlaceholders.forEach(({ ph, official }) => {
    normalized = normalized.replace(new RegExp(ph, "g"), official);
  });

  return normalized;
}

module.exports = {
  normalizeUserQuery,
  refreshDynamicDbEntities,
  removeVietnameseTones,
  WORD_MAP,
};
