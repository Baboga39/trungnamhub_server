const axios = require("axios");
const jwt = require("jsonwebtoken");
const executiveDashboardService = require("./executiveDashboardService");
const dashboardService = require("./dashboardService");
const prisma = require("../libs/prisma");
const { normalizeUserQuery } = require("../libs/aiQueryNormalizer");

const JWT_SECRET = process.env.JWT_SECRET || "TrungnamHub";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODELS_TO_TRY = [
  process.env.GEMINI_MODEL,
  "gemini-3.6-flash",
  "gemini-flash-lite-latest",
].filter(Boolean);

const PROGRAM_SERVER_URL = process.env.PROGRAM_SERVER_URL || "http://localhost:5001";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TOOL DECLARATIONS FOR GEMINI FUNCTION CALLING (13 COMPREHENSIVE TOOLS)
// ─────────────────────────────────────────────────────────────────────────────
const toolDeclarations = [
  {
    name: "get_executive_overview",
    description: "Lấy số liệu tổng quan điều hành: tổng số đoàn sinh, tỷ lệ chuyên cần, điểm đánh giá trung bình, tham gia hoạt động và số đoàn sinh cảnh báo trong quý/năm.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu (ví dụ: 2026)" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu (1, 2, 3 hoặc 4)" },
        branch: { type: "STRING", description: "Tên Ngành (Đồng, Thiếu, Thanh, hoặc 'all' cho toàn Gia Đình Hưng Đạo Trung Nam)" },
      },
    },
  },
  {
    name: "get_branch_performance",
    description: "So sánh hiệu suất, tỷ lệ chuyên cần, điểm số trung bình và xếp hạng thi đua giữa 3 Ngành (Đồng, Thiếu, Thanh).",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu (ví dụ: 2026)" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu (1, 2, 3 hoặc 4)" },
      },
    },
  },
  {
    name: "get_member_demographics",
    description: "Thống kê cơ cấu, phân bố đoàn sinh theo: Xã đạo/Xã đạo (parish), Họ Đạo/Nhà thờ (church), Giới tính (gender), Phân đoàn/Đội (group), Ngành (branch), hoặc Năm sinh/Độ tuổi (birthYear).",
    parameters: {
      type: "OBJECT",
      properties: {
        groupBy: {
          type: "STRING",
          description: "Trường cần nhóm: 'parish' (xã đạo/Xã đạo), 'church' (Họ Đạo), 'gender' (giới tính), 'group' (chi đoàn/đội), 'branch' (ngành), 'birthYear' (năm sinh/độ tuổi)",
        },
        branch: {
          type: "STRING",
          description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all' cho toàn Gia Đình Hưng Đạo Trung Nam)",
        },
      },
    },
  },
  {
    name: "get_members_list",
    description: "Tra cứu, lọc và lấy danh sách chi tiết đoàn sinh theo nhiều tiêu chí linh hoạt: năm sinh (birthYear, ví dụ: 2012), năm tham gia/gia nhập (startYear), khoảng độ tuổi (minAge, maxAge, age), tháng sinh (birthMonth), ngành (branch: 'Đồng', 'Thiếu', 'Thanh', 'all'), giới tính (gender: 'Nam', 'Nữ'), xã đạo/giáo họ (parish), họ đạo/giáo xứ (church), phân đoàn/đội (group: 'Tùng', 'Trúc', 'Thông'...), trạng thái sinh hoạt (active: true/false), hoặc từ khóa họ tên. Trả về danh sách chi tiết gồm: STT, Mã ĐS, Họ và tên, Ngày sinh, Tuổi, Giới tính, Ngành, Phân đoàn/Đội, Xã đạo, Họ Đạo, Cha mẹ, SĐT liên hệ, Trạng thái.",
    parameters: {
      type: "OBJECT",
      properties: {
        birthYear: { type: "INTEGER", description: "Năm sinh của đoàn sinh (ví dụ: 2012, 2011, 2013)" },
        startYear: { type: "INTEGER", description: "Năm bắt đầu tham gia/gia nhập (ví dụ: 2023, 2012)" },
        birthMonth: { type: "INTEGER", description: "Tháng sinh (1-12)" },
        age: { type: "INTEGER", description: "Độ tuổi chính xác cần tìm (ví dụ: 14 tuổi)" },
        minAge: { type: "INTEGER", description: "Độ tuổi tối thiểu" },
        maxAge: { type: "INTEGER", description: "Độ tuổi tối đa" },
        branch: { type: "STRING", description: "Tên Ngành ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
        gender: { type: "STRING", description: "Giới tính ('Nam' hoặc 'Nữ')" },
        parish: { type: "STRING", description: "Tên Xã đạo / Giáo họ (ví dụ: Phước Mỹ, Phước Nguyên, Phước Minh, Trung Nam...)" },
        church: { type: "STRING", description: "Tên Họ Đạo / Giáo xứ" },
        group: { type: "STRING", description: "Tên Chi đoàn / Đội / Phân đoàn (ví dụ: Tùng, Trúc, Thông...)" },
        active: { type: "BOOLEAN", description: "Còn đang sinh hoạt hay không (mặc định true)" },
        query: { type: "STRING", description: "Từ khóa tên nếu cần lọc phụ" },
        limit: { type: "INTEGER", description: "Số lượng tối đa cần lấy (mặc định 50)" },
      },
    },
  },
  {
    name: "search_member_profile",
    description: "Tra cứu chi tiết hồ sơ cá nhân, lý lịch gia đình, điểm các môn học, chuyên cần và lịch sử thăng ngành của một hoặc nhiều đoàn sinh theo tên hoặc từ khóa.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Tên hoặc từ khóa tìm kiếm đoàn sinh (ví dụ: 'Vy', 'Trần Xuân Vinh', 'Dũng')" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_top_members",
    description: "Lấy danh sách các đoàn sinh xuất sắc dẫn đầu (Top performers) theo điểm tổng thể, điểm môn học, hoặc chuyên cần.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu" },
        branch: { type: "STRING", description: "Ngành (Đồng, Thiếu, Thanh, hoặc 'all')" },
        sortBy: { type: "STRING", description: "Tiêu chí xếp hạng: 'overall' (tổng thể), 'score' (điểm thi đua), 'attendance' (chuyên cần), 'activity' (hoạt động)" },
        limit: { type: "INTEGER", description: "Số lượng đoàn sinh cần lấy (mặc định 10)" },
      },
    },
  },
  {
    name: "get_risk_members",
    description: "Lấy danh sách các đoàn sinh thuộc diện cảnh báo nguy cơ (vắng học nhiều, trễ giờ, hoặc điểm tụt sâu so với trung bình Ngành).",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu" },
        branch: { type: "STRING", description: "Ngành (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_attendance_trend",
    description: "Lấy chuỗi dữ liệu xu hướng tỷ lệ chuyên cần theo từng tuần / buổi sinh hoạt gần nhất trong Quý.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu" },
        branch: { type: "STRING", description: "Ngành (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_session_attendance_details",
    description: "Xem chi tiết điểm danh các buổi sinh hoạt gần đây: ngày diễn ra, tổng số hiện diện, số vắng, danh sách cụ thể các em vắng/có phép/không phép.",
    parameters: {
      type: "OBJECT",
      properties: {
        limit: { type: "INTEGER", description: "Số buổi sinh hoạt cần xem (mặc định 5)" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_subject_grades_analytics",
    description: "Phân tích điểm số theo từng môn học: điểm trung bình từng môn, môn nào điểm cao nhất/thấp nhất, phân bổ xếp loại giỏi/khá/trung bình/yếu và cấu hình hệ số môn.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_activities_summary",
    description: "Thống kê các sự kiện, hoạt động ngoại khóa, phong trào (trại, dã ngoại, hội thảo) trong Quý/Năm và tỷ lệ tham gia của đoàn sinh.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu" },
      },
    },
  },
  {
    name: "get_quarter_programs",
    description: "Tra cứu tiến độ kế hoạch chương trình giáo lý quý (Quarter Programs), trạng thái phê duyệt (DRAFT, PENDING, APPROVED) và danh sách bài học/giáo án của các ngành.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu" },
        branch: { type: "STRING", description: "Ngành (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_leaders_directory",
    description: "Danh sách trưởng, Ban Quản Trị và Phân công trách nhiệm theo từng Ngành.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_documents_and_approvals",
    description: "Thống kê danh sách các Chương trình sinh hoạt Quý (Quarter Programs), tài liệu, tờ trình và tiến độ phê duyệt (PENDING/chờ duyệt, APPROVED/đã duyệt, NEED_REVISION/cần sửa, DRAFT/nháp) của các ngành.",
    parameters: {
      type: "OBJECT",
      properties: {
        status: { type: "STRING", description: "Trạng thái lọc: 'PENDING' (chờ duyệt), 'APPROVED' (đã duyệt), 'NEED_REVISION' (cần sửa), 'DRAFT' (bản nháp), hoặc 'all'" },
      },
    },
  },
  {
    name: "get_quarterly_birthdays",
    description: "Tra cứu danh sách đoàn sinh có sinh nhật trong Quý hoặc Tháng cụ thể (ngày sinh, tháng sinh, tuổi, ngành, chi đoàn, Xã đạo/xã đạo, mừng tuổi mới) của các ngành hoặc toàn Gia Đình Hưng Đạo Trung Nam.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu (ví dụ: 2026)" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu (1, 2, 3 hoặc 4)" },
        month: { type: "INTEGER", description: "Tháng sinh cụ thể (1-12, tùy chọn)" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all' cho toàn đoàn)" },
      },
    },
  },
  {
    name: "get_emergency_contact_directory",
    description: "Tra cứu danh bạ liên lạc khẩn cấp (SĐT phụ huynh, họ tên ba mẹ, địa chỉ nhà) của đoàn sinh theo tên hoặc theo ngành/chi đoàn để liên hệ trực tiếp.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Tên đoàn sinh, phụ huynh, SĐT hoặc địa chỉ cần tìm" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
        limit: { type: "INTEGER", description: "Số lượng kết quả trả về (mặc định 10)" },
      },
    },
  },
  {
    name: "get_attendance_streak_leaderboard",
    description: "Bảng vàng chuỗi chuyên cần (Top đoàn sinh có chuỗi tham gia sinh hoạt liên tục dài nhất hiện tại và kỷ lục dài nhất lịch sử). Có thể lọc theo ngành hoặc xem toàn Gia Đình Hưng Đạo.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
        limit: { type: "INTEGER", description: "Số lượng top đoàn sinh (mặc định 15)" },
      },
    },
  },
  {
    name: "get_consecutive_absent_alerts",
    description: "Cảnh báo danh sách các đoàn sinh vắng liên tiếp từ 2 đến 3+ buổi sinh hoạt gần nhất để trưởng và Ban Quản Trị kịp thời nắm bắt và liên hệ thăm hỏi gia đình.",
    parameters: {
      type: "OBJECT",
      properties: {
        consecutiveCount: { type: "INTEGER", description: "Số buổi vắng liên tiếp tối thiểu cần lọc (mặc định 2 buổi)" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_grade_distribution_summary",
    description: "Thống kê phổ điểm và phân bổ xếp loại học lực / thi đua (Tỷ lệ và số lượng đoàn sinh đạt Xuất sắc, Giỏi, Khá, Trung bình, Yếu) trong quý.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu (ví dụ: 2026)" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu (1, 2, 3 hoặc 4)" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_upcoming_events",
    description: "Tra cứu danh sách các sự kiện, ngày hội, cắm trại, dã ngoại, hội thảo hoặc hoạt động phong trào sắp diễn ra trong thời gian tới.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu (mặc định năm hiện tại)" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu (1, 2, 3 hoặc 4)" },
      },
    },
  },
  {
    name: "get_member_activity_history",
    description: "Tra cứu lịch sử và tỷ lệ tham gia các hoạt động ngoại khóa, trại hè, sự kiện phong trào của một đoàn sinh cụ thể theo tên.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Tên đoàn sinh cần tra cứu lịch sử ngoại khóa" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_promotion_and_new_members",
    description: "Thống kê danh sách đoàn sinh mới gia nhập theo năm sinh hoạt (dựa trên trường startYear / startDate trong DB) và lịch sử thăng cấp / chuyển ngành của đoàn sinh.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm gia nhập cần lọc (ví dụ: 2026, 2025, hoặc bỏ trống để lấy tất cả)" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_group_squad_distribution",
    description: "Thống kê cơ cấu phân chia các Đội, Chi đoàn, Tổ, Phân đoàn nội bộ trong từng Ngành (số lượng đoàn sinh trong mỗi đội/chi đoàn).",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_leaders_contribution_stats",
    description: "Thống kê chi tiết mức độ đóng góp của Ban trưởng: thâm niên gắn bó (năm bắt đầu), số sự kiện/hoạt động đã tổ chức, số buổi sinh hoạt và lượt điểm danh đã thực hiện.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_scoring_rules_and_weights",
    description: "Tra cứu quy chế chấm điểm thi đua, danh mục các môn học, hệ số môn (weight) và tỷ lệ % đóng góp của từng môn vào điểm tổng kết.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "get_yearly_summary_report",
    description: "Báo cáo tổng kết toàn diện cả năm học: tổng số buổi sinh hoạt đã tổ chức, tỷ lệ chuyên cần cả năm, tổng số sự kiện phong trào và số lượng đoàn sinh được thăng cấp.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tổng kết (mặc định năm hiện tại)" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },

  {
    name: "get_leader_to_member_ratio",
    description: "Thống kê tỷ lệ nhân sự trưởng trên số lượng Đoàn sinh (Leader-to-Member Ratio) của từng ngành và đánh giá mức độ bao quát nhân sự theo chuẩn sư phạm TNTT.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_system_health_and_data_summary",
    description: "Báo cáo tổng quan sức khỏe cơ sở dữ liệu và mức độ hoàn thiện hồ sơ: tổng số đoàn sinh active/inactive, tỷ lệ có SĐT phụ huynh, tỷ lệ có ngày sinh/địa chỉ đầy đủ.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "get_branch_contact_representatives",
    description: "Danh bạ đại diện liên lạc chính thức của từng ngành (Gia Đình Hưng Đạo Trưởng, Thiếu Trưởng, Đồng Trưởng, Thanh Trưởng) để phụ huynh hoặc người mới tiện liên hệ.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CÁC CÔNG CỤ NÂNG CAO CHO NGƯỜI ĐÃ BIẾT THÔNG TIN VÀ MUỐN PHÂN TÍCH CHUYÊN SÂU
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: "get_sibling_family_groups",
    description: "Tìm kiếm các gia đình có từ 2 anh chị em ruột trở lên cùng sinh hoạt trong Gia Đình Hưng Đạo (cùng SĐT phụ huynh hoặc cùng ba mẹ/địa chỉ) để hỗ trợ liên lạc gia đình.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_inactive_and_dropped_members",
    description: "Thống kê danh sách các đoàn sinh đã nghỉ sinh hoạt hoặc chuyển xứ (active = false) kèm thông tin liên lạc và Họ Đạo.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_lesson_preparation_readiness",
    description: "Kiểm tra mức độ chuẩn bị bài học/giáo án trong Quý: số bài đã gán trưởng phụ trách, số bài đã chuẩn bị tài liệu (prepared=true), số bài đã upload file đính kèm.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần kiểm tra (mặc định năm hiện tại)" },
        quarter: { type: "INTEGER", description: "Quý cần kiểm tra (1, 2, 3 hoặc 4)" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_grade_outliers_and_anomalies",
    description: "Phát hiện các trường hợp bất thường về điểm số: chênh lệch điểm quá lớn giữa các môn học hoặc có môn đạt điểm dưới trung bình (<5.0) để trưởng kèm cặp.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm học" },
        quarter: { type: "INTEGER", description: "Quý cần kiểm tra" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_session_detailed_history",
    description: "Tra cứu nhật ký chi tiết của một buổi sinh hoạt cụ thể: ngày diễn ra, ngành, người điểm danh và danh sách chi tiết các em vắng mặt (kèm lý do phép/không phép) hoặc đi trễ.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành sinh hoạt (Đồng, Thiếu, Thanh)" },
        date: { type: "STRING", description: "Ngày sinh hoạt (định dạng YYYY-MM-DD hoặc DD/MM/YYYY, nếu để trống sẽ lấy buổi gần nhất)" },
      },
    },
  },
  {
    name: "get_attendance_by_day_of_week",
    description: "Phân tích số buổi và tỷ lệ chuyên cần theo từng ngày trong tuần (Chúa Nhật vs các ngày lễ/sinh hoạt trong tuần) để đánh giá lịch sinh hoạt.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần phân tích" },
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_unassigned_members_and_leaders",
    description: "Rà soát danh sách đoàn sinh chưa được xếp vào Chi đoàn/Đội nào hoặc thiếu thông tin Họ Đạo, và trưởng chưa được gán ngành phụ trách.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all')" },
      },
    },
  },
  {
    name: "get_comprehensive_member_audit_card",
    description: "Thẻ kiểm toán toàn diện 360 độ của một đoàn sinh: hồ sơ gia đình, bảng điểm tất cả các Quý trong năm, tổng kết chuyên cần cả năm, lịch sử thăng cấp và phong trào.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Tên hoặc ID đoàn sinh cần xuất thẻ kiểm toán toàn diện" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_organization_structure",
    description: "Cơ cấu tổ chức Gia Đình Hưng Đạo Trung Nam: 3 ngành (Đồng, Thiếu, Thanh), tôn chỉ, khẩu hiệu, ban trưởng, lứa tuổi, màu khăn và sĩ số active thực tế.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
      },
    },
  },
  {
    name: "get_attendance_analytics",
    description: "Phân tích số liệu chuyên cần chi tiết: tỷ lệ hiện diện, số buổi vắng (phép, không phép, trễ), công thức quy đổi chuẩn, điểm chuyên cần trung bình và phổ chuyên cần.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần phân tích" },
        quarter: { type: "INTEGER", description: "Quý cần phân tích (1-4)" },
        branch: { type: "STRING", description: "Ngành lọc ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
      },
    },
  },
  {
    name: "get_church_parish_breakdown",
    description: "Thống kê phân bố đoàn sinh theo từng Giáo họ/Xã đạo (parish) và Giáo xứ/Họ Đạo (church) cụ thể kèm tỷ lệ phần trăm và cơ cấu ngành.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
      },
    },
  },
  {
    name: "get_faqs_and_guidelines",
    description: "Hỏi đáp quy chế & hướng dẫn cơ bản cho người mới/phụ huynh: Giờ giấc sinh hoạt Chúa Nhật, quy định đồng phục, 4 tôn chỉ TNTT, quy trình xin phép vắng, học phí miễn phí, cách thức đăng ký.",
    parameters: {
      type: "OBJECT",
      properties: {
        category: { type: "STRING", description: "Chủ đề: 'schedule' (giờ giấc), 'uniform' (đồng phục), 'motto' (tôn chỉ), 'attendance' (vắng/trễ), 'tuition' (học phí), 'registration' (đăng ký), hoặc 'all'" },
      },
    },
  },
  {
    name: "get_branch_curriculum_overview",
    description: "Lộ trình giáo lý, ý nghĩa màu khăn, châm ngôn và mục tiêu sư phạm của 3 ngành (Đồng, Thiếu, Thanh).",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
      },
    },
  },
  {
    name: "get_liturgical_calendar_and_feasts",
    description: "Lịch phụng vụ, Lễ Bổn mạng Gia Đình Hưng Đạo Trung Nam, Quan thầy các ngành (Đồng, Thiếu, Thanh), Ban Trưởng và các ngày lễ trọng trong năm.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
      },
    },
  },
  {
    name: "get_top_performers",
    description: "Bảng vàng thi đua: Top đoàn sinh xuất sắc dẫn đầu về điểm số tổng kết, chuyên cần hoặc hoạt động phong trào.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu" },
        branch: { type: "STRING", description: "Ngành ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
        sortBy: { type: "STRING", description: "Tiêu chí xếp hạng: 'overall', 'score', 'attendance', 'activity'" },
        limit: { type: "INTEGER", description: "Số lượng top (mặc định 10)" },
      },
    },
  },
  {
    name: "get_at_risk_members",
    description: "Danh sách đoàn sinh thuộc diện cảnh báo nguy cơ (vắng học nhiều, trễ giờ thường xuyên, hoặc điểm tụt sâu).",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần tra cứu" },
        quarter: { type: "INTEGER", description: "Quý cần tra cứu" },
        branch: { type: "STRING", description: "Ngành ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
      },
    },
  },
  {
    name: "get_camp_participants_and_activities",
    description: "Thống kê chi tiết các hoạt động cắm trại, dã ngoại, hội trại truyền thống, trò chơi lớn và tỷ lệ tham gia theo ngành.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm tổ chức sự kiện" },
        quarter: { type: "INTEGER", description: "Quý tổ chức (1-4)" },
        branch: { type: "STRING", description: "Ngành ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
        activityName: { type: "STRING", description: "Tên hoạt động (ví dụ: 'Trại', 'Dã ngoại', 'Lửa trại')" },
      },
    },
  },
  {
    name: "get_upcoming_birthdays_next_30_days",
    description: "Tra cứu danh sách đoàn sinh và Trưởng có sinh nhật sắp tới trong vòng 30 ngày để kịp thời chuẩn bị quà chúc mừng.",
    parameters: {
      type: "OBJECT",
      properties: {
        branch: { type: "STRING", description: "Ngành lọc ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
        limit: { type: "INTEGER", description: "Số lượng hiển thị (mặc định 25)" },
      },
    },
  },
  {
    name: "get_attendance_comparison_by_quarter",
    description: "So sánh tỷ lệ chuyên cần qua 4 Quý trong năm để đánh giá xu hướng tăng giảm và ổn định sĩ số của từng ngành.",
    parameters: {
      type: "OBJECT",
      properties: {
        year: { type: "INTEGER", description: "Năm cần so sánh" },
        branch: { type: "STRING", description: "Ngành ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
      },
    },
  },
  {
    name: "get_member_health_and_notes",
    description: "Tra cứu các ghi chú sư phạm, lưu ý sức khỏe, hoàn cảnh gia đình hoặc lưu ý điểm danh của đoàn sinh.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Tên đoàn sinh hoặc từ khóa cần tìm" },
        branch: { type: "STRING", description: "Ngành lọc ('Đồng', 'Thiếu', 'Thanh', hoặc 'all')" },
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. TOOL EXECUTION HANDLER
// ─────────────────────────────────────────────────────────────────────────────
async function executeTool(toolName, args, userContext) {
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;

  const year = args.year ? Number(args.year) : currentYear;
  const quarter = args.quarter ? Number(args.quarter) : currentQuarter;

  // Không áp dụng branch scope — mọi người dùng có thể xem dữ liệu tất cả các Ngành
  // Branch lấy từ args của tool (câu hỏi người dùng), không bị khóa theo tài khoản
  let branch = args.branch || "all";

  try {
    switch (toolName) {
      // 1. Tổng quan điều hành
      case "get_executive_overview": {
        const data = await executiveDashboardService.getExecutiveOverview(userContext, { year, quarter, branch });
        return { success: true, data };
      }

      // 2. So sánh hiệu suất ngành
      case "get_branch_performance": {
        const data = await executiveDashboardService.getExecutiveBranchPerformance(userContext, { year, quarter });
        return { success: true, data };
      }

      // 3. Phân bố nhân khẩu / Xã đạo / Họ Đạo / Giới tính
      case "get_member_demographics": {
        const groupBy = args.groupBy || "parish";
        const where = { active: true };
        if (branch && branch !== "all") {
          where.branch = branch;
        }
        const members = await prisma.member.findMany({
          where,
          select: {
            id: true,
            name: true,
            parish: true,
            church: true,
            gender: true,
            group: true,
            branch: true,
            birthDate: true,
          },
        });

        const counts = {};
        for (const m of members) {
          let val = "Chưa cập nhật";
          if (groupBy === "birthYear") {
            val = m.birthDate ? new Date(m.birthDate).getFullYear().toString() : "Chưa cập nhật";
          } else {
            val = m[groupBy];
            if (!val || val === "-" || !val.trim()) val = "Chưa cập nhật";
            else val = val.trim();
          }
          counts[val] = (counts[val] || 0) + 1;
        }

        const total = members.length;
        const ranking = Object.entries(counts)
          .map(([name, count]) => ({
            name,
            count,
            percentage: ((count / (total || 1)) * 100).toFixed(1) + "%",
          }))
          .sort((a, b) => b.count - a.count);

        return {
          success: true,
          data: {
            totalMembers: total,
            groupBy,
            branch,
            ranking,
          },
        };
      }

      // 0. Tra cứu danh sách chi tiết đoàn sinh theo bộ lọc (năm sinh, tuổi, ngành, đội, xã đạo...)
      case "get_members_list": {
        const targetBranch = args.branch || branch || "all";
        const where = {};

        if (args.active !== undefined) {
          where.active = Boolean(args.active);
        } else {
          where.active = true;
        }

        if (targetBranch && targetBranch !== "all") {
          where.branch = targetBranch;
        }

        if (args.gender) {
          where.gender = { equals: args.gender, mode: "insensitive" };
        }

        if (args.parish) {
          where.parish = { contains: args.parish.trim(), mode: "insensitive" };
        }

        if (args.church) {
          where.church = { contains: args.church.trim(), mode: "insensitive" };
        }

        if (args.group) {
          where.group = { contains: args.group.trim(), mode: "insensitive" };
        }

        if (args.startYear) {
          where.startYear = Number(args.startYear);
        }

        if (args.query && typeof args.query === "string" && args.query.trim()) {
          where.name = { contains: args.query.trim(), mode: "insensitive" };
        }

        let members = await prisma.member.findMany({
          where,
          orderBy: [
            { branch: "asc" },
            { name: "asc" },
          ],
        });

        // Lọc theo năm sinh (birthYear)
        if (args.birthYear) {
          const by = Number(args.birthYear);
          members = members.filter((m) => m.birthDate && new Date(m.birthDate).getFullYear() === by);
        }

        // Lọc theo tháng sinh (birthMonth)
        if (args.birthMonth) {
          const bm = Number(args.birthMonth);
          members = members.filter((m) => m.birthDate && (new Date(m.birthDate).getMonth() + 1) === bm);
        }

        // Lọc theo độ tuổi (age)
        if (args.age) {
          const targetAge = Number(args.age);
          members = members.filter((m) => {
            if (!m.birthDate) return false;
            const bYear = new Date(m.birthDate).getFullYear();
            return (currentYear - bYear) === targetAge;
          });
        }

        // Lọc theo khoảng độ tuổi (minAge, maxAge)
        if (args.minAge || args.maxAge) {
          const minA = args.minAge ? Number(args.minAge) : 0;
          const maxA = args.maxAge ? Number(args.maxAge) : 999;
          members = members.filter((m) => {
            if (!m.birthDate) return false;
            const bYear = new Date(m.birthDate).getFullYear();
            const age = currentYear - bYear;
            return age >= minA && age <= maxA;
          });
        }

        const limit = args.limit ? Number(args.limit) : 50;
        const totalFound = members.length;
        const paginated = members.slice(0, limit);

        const formattedList = paginated.map((m, idx) => {
          const bDate = m.birthDate ? new Date(m.birthDate) : null;
          const bYear = bDate ? bDate.getFullYear() : null;
          const age = bYear ? currentYear - bYear : null;
          const formattedBDate = bDate ? `${String(bDate.getDate()).padStart(2, "0")}/${String(bDate.getMonth() + 1).padStart(2, "0")}/${bYear}` : "Chưa cập nhật";

          return {
            stt: idx + 1,
            id: m.id,
            name: m.name,
            birthDate: formattedBDate,
            birthYear: bYear,
            age: age ? `${age} tuổi` : "—",
            gender: m.gender || "—",
            branch: m.branch || "—",
            group: m.group || "Chưa xếp đội",
            parish: m.parish || "Chưa cập nhật",
            church: m.church || "Chưa cập nhật",
            contact: m.contact && m.contact !== "—" ? m.contact : "Chưa có SĐT",
            fatherName: m.fatherName && m.fatherName !== "—" ? m.fatherName : "—",
            motherName: m.motherName && m.motherName !== "—" ? m.motherName : "—",
            address: m.address || "—",
            startYear: m.startYear || "—",
            active: m.active ? "Đang sinh hoạt" : "Đã nghỉ",
          };
        });

        return {
          success: true,
          data: {
            totalFound,
            displayed: formattedList.length,
            filters: {
              birthYear: args.birthYear || null,
              startYear: args.startYear || null,
              birthMonth: args.birthMonth || null,
              age: args.age || null,
              branch: targetBranch,
              gender: args.gender || null,
              parish: args.parish || null,
              church: args.church || null,
              group: args.group || null,
            },
            members: formattedList,
            note: totalFound === 0 
              ? "Không tìm thấy đoàn sinh nào phù hợp với bộ lọc yêu cầu."
              : `Tìm thấy ${totalFound} đoàn sinh phù hợp.`,
          },
        };
      }

      // 4. Tra cứu chi tiết hồ sơ cá nhân đoàn sinh
      case "search_member_profile": {
        const rawQuery = (args.query || "").trim();
        let cleanQuery = rawQuery.replace(/^(ba|mẹ|cha|bố|phụ huynh|thông tin|hồ sơ|em|bạn|đoàn sinh|anh|chị)\s+(của\s+)?(em\s+|bạn\s+|đoàn sinh\s+)?/gi, "").trim();
        cleanQuery = cleanQuery.replace(/\s+(là\s+ai|ở\s+đâu|sinh\s+năm\s+nào|bao\s+nhiêu\s+tuổi|như\s+thế\s+nào|mới\s+lên\s+thiếu|mới\s+lên\s+thanh|mới\s+lên\s+đồng)\??$/gi, "").trim();
        const searchKeyword = cleanQuery || rawQuery;

        const orConditions = [
          { name: { contains: searchKeyword, mode: "insensitive" } },
          { fatherName: { contains: searchKeyword, mode: "insensitive" } },
          { motherName: { contains: searchKeyword, mode: "insensitive" } },
          { parish: { contains: searchKeyword, mode: "insensitive" } },
          { group: { contains: searchKeyword, mode: "insensitive" } },
        ];
        if (rawQuery && rawQuery !== searchKeyword) {
          orConditions.push({ name: { contains: rawQuery, mode: "insensitive" } });
        }

        const includeObj = {
          grades: {
            where: { year, quarter },
            include: { category: true },
          },
          attendances: {
            take: 8,
            orderBy: { date: "desc" },
          },
          statusHistory: {
            take: 5,
            orderBy: { date: "desc" },
          },
        };

        // 1. Fetch candidates from requested branch or all branches
        let candidates = [];
        if (branch && branch !== "all") {
          candidates = await prisma.member.findMany({
            where: {
              branch,
              OR: orConditions,
            },
            take: 30,
            include: includeObj,
          });
        }

        if (candidates.length === 0) {
          candidates = await prisma.member.findMany({
            where: {
              OR: orConditions,
            },
            take: 30,
            include: includeObj,
          });
        }

        // 2. Score and rank candidates by name relevance
        const sk = searchKeyword.toLowerCase();
        const scored = candidates.map((m) => {
          let score = 0;
          const nameWords = m.name.toLowerCase().split(/\s+/);
          if (nameWords.includes(sk)) score += 100; // Tên khớp từ chính xác (ví dụ: 'Anh' trong 'Lê Đức Anh')
          if (nameWords[nameWords.length - 1] === sk) score += 50; // Tên chính (Given name)
          if (m.name.toLowerCase().includes(sk)) score += 30;
          if (m.fatherName && m.fatherName.toLowerCase().split(/\s+/).includes(sk)) score += 20;
          if (m.motherName && m.motherName.toLowerCase().split(/\s+/).includes(sk)) score += 20;
          if (m.branch === branch) score += 10;
          return { m, score };
        });

        scored.sort((a, b) => b.score - a.score);
        let members = scored.slice(0, 5).map((s) => s.m);

        if (members.length === 0) {
          const matchingUsers = await prisma.user.findMany({
            where: {
              active: true,
              OR: [
                { name: { contains: searchKeyword, mode: "insensitive" } },
                { email: { contains: searchKeyword, mode: "insensitive" } },
              ],
            },
            take: 3,
          });

          if (matchingUsers.length > 0) {
            const formattedLeaders = matchingUsers.map((u) => ({
              id: u.id,
              name: u.name,
              role: u.role || "trưởng",
              branch: u.branch ? "Ngành " + u.branch : "Toàn Gia Đình Hưng Đạo Trung Nam",
              email: u.email,
              eventsOrganized: u.sumEvent || 0,
              startYear: u.startYear ? new Date(u.startYear).getFullYear() : "—",
              isLeader: true,
            }));
            return {
              success: true,
              data: {
                count: formattedLeaders.length,
                isLeader: true,
                leaders: formattedLeaders,
                note: `Không tìm thấy đoàn sinh tên '${searchKeyword}', nhưng tìm thấy thông tin trưởng / Ban Quản Trị trong hệ thống.`,
              },
            };
          }

          return {
            success: true,
            data: {
              count: 0,
              members: [],
              searchedKeyword: searchKeyword,
              note: `Không tìm thấy thông tin đoàn sinh nào tên '${searchKeyword}' trong hệ thống Gia Đình Hưng Đạo Trung Nam.`,
            },
          };
        }

        const startQuarterMonth = (quarter - 1) * 3;
        const startQuarterDate = new Date(year, startQuarterMonth, 1);
        const endQuarterDate = new Date(year, startQuarterMonth + 3, 0, 23, 59, 59, 999);

        const branchList = [...new Set(members.map((m) => m.branch).filter(Boolean))];
        const branchSessionsMap = {};
        for (const b of branchList) {
          let count = await prisma.session.count({
            where: {
              branch: b,
              date: { gte: startQuarterDate, lte: endQuarterDate },
            },
          });
          if (count === 0) {
            count = await prisma.session.count({
              where: {
                branch: b,
                date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59, 999) },
              },
            });
          }
          branchSessionsMap[b] = count;
        }

        const formatted = members.map((m) => {
          const totalGrades = m.grades || [];
          let weightedSum = 0;
          let weightTotal = 0;
          totalGrades.forEach((g) => {
            const w = g.category?.weight || 1;
            weightedSum += (g.score || 0) * w;
            weightTotal += w;
          });
          const avgScore = weightTotal > 0 ? (weightedSum / weightTotal).toFixed(1) : "Chưa có";

          // Calculate attendance rate based on Absence by Exception
          let absentEquivalent = 0;
          (m.attendances || []).forEach((a) => {
            const st = (a.status || "").toLowerCase();
            if (st === "absent") absentEquivalent += 1;
            else if (st === "late") absentEquivalent += 0.5;
            else if (st === "excused" || st === "absent_with_permission") absentEquivalent += 0.2;
          });

          const branchSessions = branchSessionsMap[m.branch] || 0;
          let attRate = "100%";
          if (branchSessions > 0) {
            const rateVal = Math.max(0, Math.min(100, Math.round(((branchSessions - absentEquivalent) / branchSessions) * 100)));
            attRate = `${rateVal}%`;
          } else if (m.attendances.length > 0) {
            attRate = "Chưa có buổi sinh hoạt ghi nhận";
          }

          return {
            id: m.id,
            name: m.name,
            gender: m.gender || "—",
            birthDate: m.birthDate ? new Date(m.birthDate).toLocaleDateString("vi-VN") : "—",
            branch: m.branch,
            active: m.active,
            group: m.group || "—",
            parish: m.parish || "—",
            church: m.church || "—",
            address: m.address || "—",
            contact: m.contact || "—",
            fatherName: m.fatherName || "—",
            motherName: m.motherName || "—",
            averageScore: avgScore,
            subjectGrades: totalGrades.map((g) => ({
              subject: g.category?.name,
              score: g.score,
              weight: g.category?.weight,
            })),
            recentAttendanceRate: attRate,
            recentAttendances: m.attendances.map((a) => {
              const st = (a.status || "").toLowerCase();
              let statusVi = "Có mặt";
              if (st === "absent") statusVi = "Vắng mặt";
              else if (st === "late") statusVi = "Đi trễ";
              else if (st === "excused" || st === "absent_with_permission") statusVi = "Có phép";
              return {
                date: new Date(a.date).toLocaleDateString("vi-VN"),
                status: statusVi,
              };
            }),
            statusHistory: m.statusHistory.map((s) => ({
              type: s.type,
              note: s.note,
              date: new Date(s.date).toLocaleDateString("vi-VN"),
              fromBranch: s.fromBranch,
              toBranch: s.toBranch,
            })),
          };
        });

        return { success: true, data: { count: formatted.length, members: formatted } };
      }

      // 5. Top đoàn sinh xuất sắc
      case "get_top_performers":
      case "get_top_members": {
        const limit = args.limit ? Number(args.limit) : 10;
        const sortBy = args.sortBy || "overall";
        const data = await executiveDashboardService.getExecutiveTopMembers(userContext, { year, quarter, branch, sortBy, limit });
        return { success: true, data };
      }

      // 6. Đoàn sinh diện cảnh báo nguy cơ
      case "get_at_risk_members":
      case "get_risk_members": {
        const data = await executiveDashboardService.getExecutiveRiskMembers(userContext, { year, quarter, branch });
        return { success: true, data };
      }

      // 7. Xu hướng chuyên cần theo buổi
      case "get_attendance_trend": {
        const data = await executiveDashboardService.getExecutiveAttendanceTrend(userContext, { year, quarter, branch });
        return { success: true, data };
      }

      // 8. Chi tiết điểm danh các buổi sinh hoạt cụ thể
      case "get_session_attendance_details": {
        const limit = args.limit ? Number(args.limit) : 5;
        const sessionWhere = {};
        if (branch && branch !== "all") {
          sessionWhere.branch = branch;
        }

        const [sessions, branchMembers] = await Promise.all([
          prisma.session.findMany({
            where: sessionWhere,
            take: limit,
            orderBy: { date: "desc" },
            include: {
              attendances: {
                include: {
                  member: { select: { id: true, name: true, branch: true } },
                },
              },
            },
          }),
          prisma.member.groupBy({
            by: ["branch"],
            where: { active: true },
            _count: { id: true },
          }),
        ]);

        const branchMemberCountMap = {};
        let totalAllActive = 0;
        for (const b of branchMembers) {
          if (b.branch) {
            branchMemberCountMap[b.branch] = b._count.id;
          }
          totalAllActive += b._count.id;
        }

        const data = sessions.map((s) => {
          // Tổng sĩ số dự kiến là tổng số đoàn sinh active trong ngành tại thời điểm sinh hoạt
          const totalExpected = s.branch && branchMemberCountMap[s.branch] !== undefined ? branchMemberCountMap[s.branch] : totalAllActive;
          // Database chỉ lưu các bản ghi vắng mặt
          const absent = s.attendances.length;
          const present = Math.max(0, totalExpected - absent);
          const rate = totalExpected > 0 ? ((present / totalExpected) * 100).toFixed(1) + "%" : "100%";

          const withPerm = s.attendances.filter((a) => a.status === "EXCUSED" || a.status === "ABSENT_WITH_PERMISSION").length;
          const withoutPerm = absent - withPerm;
          const absentMembers = s.attendances.map((a) => `${a.member?.name || "Đoàn sinh"} (${(a.status === "EXCUSED" || a.status === "ABSENT_WITH_PERMISSION") ? "Có phép" : "Không phép"})`);

          return {
            sessionId: s.id,
            date: new Date(s.date).toLocaleDateString("vi-VN"),
            branch: s.branch ? "Ngành " + s.branch : "Toàn Gia Đình Hưng Đạo Trung Nam",
            totalExpected,
            presentCount: present,
            absentCount: absent,
            attendanceRate: rate,
            absentWithPermission: withPerm,
            absentWithoutPermission: withoutPerm,
            absentList: absentMembers.slice(0, 10),
            note: "Hệ thống chỉ lưu trữ danh sách đoàn sinh vắng mặt; số hiện diện = tổng sĩ số active của ngành trừ đi số vắng.",
          };
        });

        return { success: true, data };
      }

      // 9. Phân tích điểm số theo môn học
      case "get_subject_grades_analytics": {
        const categories = await prisma.gradeCategory.findMany({
          where: { active: true },
          include: {
            grades: {
              where: {
                year,
                quarter,
                ...(branch && branch !== "all" ? { mMember: { branch } } : {}),
              },
            },
          },
        });

        const subjectStats = categories.map((cat) => {
          const scores = cat.grades.map((g) => g.score);
          const count = scores.length;
          const avg = count > 0 ? (scores.reduce((a, b) => a + b, 0) / count).toFixed(1) : "—";
          const max = count > 0 ? Math.max(...scores) : "—";
          const min = count > 0 ? Math.min(...scores) : "—";
          const excellent = scores.filter((s) => s >= 8.5).length;
          const good = scores.filter((s) => s >= 6.5 && s < 8.5).length;
          const average = scores.filter((s) => s >= 5.0 && s < 6.5).length;
          const weak = scores.filter((s) => s < 5.0).length;

          return {
            subjectName: cat.name,
            weight: cat.weight,
            studentCount: count,
            averageScore: avg,
            maxScore: max,
            minScore: min,
            distribution: { excellent, good, average, weak },
          };
        });

        return {
          success: true,
          data: {
            year,
            quarter,
            branch,
            subjects: subjectStats,
          },
        };
      }

      // 10. Hoạt động ngoại khóa & sự kiện phong trào
      case "get_activities_summary": {
        const activities = await prisma.activity.findMany({
          where: { year, quarter },
          include: {
            attendances: true,
            createdBy: { select: { name: true } },
          },
          orderBy: { date: "desc" },
        });

        const totalActiveMembers = await prisma.member.count({ where: { active: true } });

        const data = activities.map((act) => {
          const participantCount = act.attendances.filter((a) => a.status === "PRESENT").length;
          return {
            id: act.id,
            name: act.name,
            description: act.description || "—",
            date: new Date(act.date).toLocaleDateString("vi-VN"),
            createdBy: act.createdBy?.name || "BQT",
            participants: participantCount,
            participationRate: totalActiveMembers > 0 ? ((participantCount / totalActiveMembers) * 100).toFixed(1) + "%" : "—",
          };
        });

        return { success: true, data: { totalActivities: activities.length, activities: data } };
      }

      // 11. Kế hoạch giáo án & chương trình sinh hoạt quý từ Program Service + Core Sessions & Activities
      case "get_quarter_programs": {
        // Tra cứu song song: (1) Giáo án từ Program Service, (2) Lịch các buổi sinh hoạt trong quý, (3) Hoạt động/Sự kiện trong quý
        const startMonth = (quarter - 1) * 3;
        const startDate = new Date(year, startMonth, 1);
        const endDate = new Date(year, startMonth + 3, 0, 23, 59, 59);

        let programLessons = [];
        let programStatus = "Chưa tạo giáo án điện tử";

        try {
          const serviceToken = jwt.sign(
            {
              userId: userContext?.id || userContext?.userId || 1,
              email: userContext?.email || "system@trungnamhub.io.vn",
              role: userContext?.role || "admin",
              branch: userContext?.branch || null,
            },
            JWT_SECRET,
            { expiresIn: "1h" }
          );

          const res = await axios.get(`${PROGRAM_SERVER_URL}/api/v1/programs`, {
            params: { year, quarter, branchId: branch !== "all" ? branch : undefined },
            headers: { Authorization: `Bearer ${serviceToken}` },
            timeout: 65000,
          });
          const programs = res.data?.data || res.data || [];

          if (Array.isArray(programs) && programs.length > 0) {
            const prog = programs[0];
            programStatus = prog.status || "DRAFT";
            try {
              const detailRes = await axios.get(`${PROGRAM_SERVER_URL}/api/v1/programs/${prog.id}`, {
                headers: { Authorization: `Bearer ${serviceToken}` },
                timeout: 65000,
              });
              const fullProg = detailRes.data?.data || detailRes.data || prog;
              programLessons = (fullProg.lessons || []).map((l) => ({
                date: new Date(l.date).toLocaleDateString("vi-VN"),
                lessonText: l.lessonText,
                prepared: l.prepared ? "Đã chuẩn bị" : "Chưa chuẩn bị",
                duration: l.durationMinutes || 45,
              }));
            } catch {}
          }
        } catch (e) {
          console.warn("Program Service query note:", e.message);
        }

        // Lấy lịch các buổi sinh hoạt thực tế trong quý từ Core database
        const [sessions, branchMembers] = await Promise.all([
          prisma.session.findMany({
            where: {
              date: { gte: startDate, lte: endDate },
              ...(branch && branch !== "all" ? { branch } : {}),
            },
            orderBy: { date: "asc" },
            include: {
              attendances: true,
            },
          }),
          prisma.member.groupBy({
            by: ["branch"],
            where: { active: true },
            _count: { id: true },
          }),
        ]);

        const branchCountMap = {};
        let totalAllMembers = 0;
        for (const b of branchMembers) {
          if (b.branch) branchCountMap[b.branch] = b._count.id;
          totalAllMembers += b._count.id;
        }

        // Lấy các sự kiện/hoạt động phong trào trong quý từ Core database
        const activities = await prisma.activity.findMany({
          where: { year, quarter },
          orderBy: { date: "asc" },
          include: {
            createdBy: { select: { name: true } },
            attendances: true,
          },
        });

        const formattedSessions = sessions.map((s) => {
          const totalExpected = s.branch && branchCountMap[s.branch] !== undefined ? branchCountMap[s.branch] : totalAllMembers;
          const absent = s.attendances.length;
          const present = Math.max(0, totalExpected - absent);
          const rate = totalExpected > 0 ? ((present / totalExpected) * 100).toFixed(1) + "%" : "100%";
          return {
            sessionId: s.id,
            date: new Date(s.date).toLocaleDateString("vi-VN"),
            branch: s.branch ? "Ngành " + s.branch : "Toàn Gia Đình Hưng Đạo Trung Nam",
            totalExpected,
            presentCount: present,
            absentCount: absent,
            attendanceRate: rate,
          };
        });

        const formattedActivities = activities.map((a) => ({
          name: a.name,
          date: new Date(a.date).toLocaleDateString("vi-VN"),
          organizer: a.createdBy?.name || "BQT",
          participants: a.attendances.filter((att) => att.status === "PRESENT").length,
        }));

        return {
          success: true,
          data: {
            year,
            quarter,
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            curriculumStatus: programStatus,
            lessonSchedule: programLessons,
            totalWeeklySessions: formattedSessions.length,
            weeklySessions: formattedSessions,
            totalActivities: formattedActivities.length,
            activities: formattedActivities,
          },
        };
      }

      // 12. Danh bạ trưởng & BQT
      case "get_leaders_directory": {
        const userWhere = { active: true };
        if (branch && branch !== "all") {
          userWhere.branch = branch;
        }

        const users = await prisma.user.findMany({
          where: userWhere,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            branch: true,
            sumEvent: true,
            startYear: true,
          },
          orderBy: { role: "asc" },
        });

        const formatted = users.map((u) => ({
          name: u.name,
          role: u.role || "trưởng",
          branch: u.branch ? "Ngành " + u.branch : "Toàn Gia Đình Hưng Đạo Trung Nam",
          email: u.email,
          eventsOrganized: u.sumEvent || 0,
          startYear: u.startYear ? new Date(u.startYear).getFullYear() : "—",
        }));

        return { success: true, data: { count: formatted.length, leaders: formatted } };
      }

      // 13. Danh sách chương trình sinh hoạt quý, tài liệu & tờ trình chờ duyệt
      case "get_documents_and_approvals": {
        const statusFilter = args.status && args.status !== "all" ? args.status : undefined;
        
        // 1. Lấy tài liệu / tờ trình từ Core database
        const docs = await prisma.document.findMany({
          where: statusFilter ? { status: statusFilter } : {},
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: { select: { name: true } },
            approvedBy: { select: { name: true } },
          },
        });

        const docData = docs.map((d) => ({
          id: d.id,
          type: "Tài liệu / Tờ trình",
          title: d.title,
          status: d.status,
          version: d.version,
          createdBy: d.createdBy?.name || "—",
          approvedBy: d.approvedBy?.name || "Chưa duyệt",
          date: new Date(d.createdAt).toLocaleDateString("vi-VN"),
        }));

        // 2. Lấy danh sách Chương trình giáo lý / Kế hoạch sinh hoạt quý từ Program microservice
        let programData = [];
        try {
          const serviceToken = jwt.sign(
            {
              userId: userContext?.id || 1,
              email: userContext?.email || "ai-agent@trungnam.org",
              role: userContext?.role || "admin",
              branch: userContext?.branch || null,
            },
            JWT_SECRET,
            { expiresIn: "1h" }
          );

          const progRes = await axios.get(`${PROGRAM_SERVER_URL}/api/v1/programs`, {
            params: statusFilter ? { status: statusFilter } : {},
            headers: { Authorization: `Bearer ${serviceToken}` },
            timeout: 10000,
          });

          const programs = progRes.data?.data || progRes.data || [];
          if (Array.isArray(programs)) {
            programData = programs.map((p) => {
              const bName = p.branch?.name || p.branchId || "Ngành";
              return {
                id: p.id,
                type: "Chương trình sinh hoạt Quý",
                title: `Chương trình sinh hoạt Quý ${p.quarter}/${p.year} - ${bName.startsWith("Ngành") ? bName : "Ngành " + bName}`,
                status: p.status,
                branch: bName,
                year: p.year,
                quarter: p.quarter,
                lessonCount: p.lessonCount || 0,
                createdBy: p.createdBy ? `trưởng #${p.createdBy}` : "—",
                date: new Date(p.createdAt).toLocaleDateString("vi-VN"),
              };
            });
          }
        } catch (err) {
          console.warn("Could not query Program Service for approvals:", err.message);
        }

        const pendingPrograms = programData.filter((p) => p.status === "PENDING");
        const pendingDocs = docData.filter((d) => d.status === "PENDING");

        return {
          success: true,
          data: {
            totalPendingCount: pendingPrograms.length + pendingDocs.length,
            pendingQuarterPrograms: pendingPrograms,
            allQuarterPrograms: programData,
            documents: docData,
            summaryMessage: `Hệ thống ghi nhận có ${pendingPrograms.length} chương trình sinh hoạt quý và ${pendingDocs.length} tài liệu đang ở trạng thái chờ duyệt (PENDING).`,
          },
        };
      }

      // 14. Danh sách sinh nhật đoàn sinh theo Quý / Tháng
      case "get_quarterly_birthdays": {
        const data = await dashboardService.getQuarterlyBirthdays({ role: "admin" }, { year, quarter, branch });
        let filteredMembers = data.members || [];
        if (args.month) {
          const targetMonth = Number(args.month);
          filteredMembers = filteredMembers.filter((m) => m.birthMonth === targetMonth);
        }
        return {
          success: true,
          data: {
            quarter,
            year,
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            totalBirthdays: filteredMembers.length,
            byMonth: data.byMonth,
            birthdays: filteredMembers.map((m) => ({
              id: m.id,
              name: m.fullName,
              birthDate: m.formattedDate + (m.birthYear ? `/${m.birthYear}` : ""),
              birthMonth: m.birthMonth,
              birthDay: m.birthDay,
              branch: m.branch ? "Ngành " + m.branch : "—",
              group: m.group || "—",
              parish: m.parish || "—",
              age: m.age,
              isToday: m.isToday,
            })),
          },
        };
      }

      // 15. Danh bạ liên lạc khẩn cấp phụ huynh
      case "get_emergency_contact_directory": {
        const query = (args.query || "").trim();
        const limit = args.limit ? Number(args.limit) : 10;
        const where = { active: true };
        if (branch && branch !== "all") where.branch = branch;
        if (query) {
          where.OR = [
            { name: { contains: query, mode: "insensitive" } },
            { fatherName: { contains: query, mode: "insensitive" } },
            { motherName: { contains: query, mode: "insensitive" } },
            { contact: { contains: query, mode: "insensitive" } },
            { address: { contains: query, mode: "insensitive" } },
          ];
        }

        const members = await prisma.member.findMany({
          where,
          take: limit,
          select: {
            id: true,
            name: true,
            branch: true,
            group: true,
            parish: true,
            contact: true,
            fatherName: true,
            motherName: true,
            address: true,
          },
          orderBy: { name: "asc" },
        });

        return {
          success: true,
          data: {
            count: members.length,
            contacts: members.map((m) => ({
              id: m.id,
              memberName: m.name,
              branch: m.branch ? "Ngành " + m.branch : "—",
              group: m.group || "—",
              phoneNumber: m.contact || "Chưa có SĐT",
              parents: `${m.fatherName ? `Bố: ${m.fatherName}` : ""}${m.fatherName && m.motherName ? " - " : ""}${m.motherName ? `Mẹ: ${m.motherName}` : ""}` || "Chưa cập nhật",
              address: m.address || "Chưa cập nhật",
              parish: m.parish || "—",
            })),
          },
        };
      }

      // 17. Bảng vàng chuỗi chuyên cần
      case "get_attendance_streak_leaderboard": {
        const limit = args.limit ? Number(args.limit) : 20;
        const targetBranch = branch !== "all" ? branch : (args.branch || "all");
        const streaks = await dashboardService.getAttendanceStreakTop(userContext, limit, targetBranch);
        return {
          success: true,
          data: {
            branch: targetBranch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + targetBranch,
            count: streaks.length,
            topStreaks: streaks.map((s, idx) => ({
              rank: idx + 1,
              id: s.id,
              name: s.fullName,
              branch: "Ngành " + s.branch,
              parish: s.parish || "—",
              currentStreak: s.currentStreak,
              longestStreak: s.longestStreak,
            })),
            note: streaks.length === 0 ? `Chưa có buổi sinh hoạt nào có dữ liệu chuyên cần cho ${targetBranch === "all" ? "các ngành này" : "Ngành " + targetBranch}.` : undefined,
          },
        };
      }

      // 18. Cảnh báo vắng liên tiếp 2, 3+ buổi sinh hoạt
      case "get_consecutive_absent_alerts": {
        const threshold = args.consecutiveCount ? Number(args.consecutiveCount) : 2;
        const recentSessions = await prisma.session.findMany({
          where: branch && branch !== "all" ? { branch } : {},
          take: 5,
          orderBy: { date: "desc" },
          select: { id: true, date: true, branch: true },
        });

        if (recentSessions.length === 0) {
          return { success: true, data: { count: 0, alertMembers: [], message: "Chưa có dữ liệu buổi sinh hoạt." } };
        }

        const sessionIds = recentSessions.map((s) => s.id);
        const attendances = await prisma.attendance.findMany({
          where: {
            sessionId: { in: sessionIds },
            status: { in: ["absent", "excused", "ABSENT", "ABSENT_WITHOUT_PERMISSION", "ABSENT_WITH_PERMISSION", "EXCUSED"] },
            member: { active: true, ...(branch && branch !== "all" ? { branch } : {}) },
          },
          include: {
            member: { select: { id: true, name: true, branch: true, group: true, contact: true, parish: true } },
            session: { select: { date: true } },
          },
        });

        const memberAbsentMap = {};
        for (const att of attendances) {
          if (!memberAbsentMap[att.memberId]) {
            memberAbsentMap[att.memberId] = {
              member: att.member,
              absentDates: [],
            };
          }
          memberAbsentMap[att.memberId].absentDates.push(new Date(att.session.date).toLocaleDateString("vi-VN"));
        }

        const alerted = Object.values(memberAbsentMap)
          .filter((item) => item.absentDates.length >= threshold)
          .map((item) => ({
            id: item.member.id,
            name: item.member.name,
            branch: item.member.branch ? "Ngành " + item.member.branch : "—",
            group: item.member.group || "—",
            parish: item.member.parish || "—",
            phone: item.member.contact || "—",
            consecutiveAbsents: item.absentDates.length,
            recentAbsentDates: item.absentDates,
          }))
          .sort((a, b) => b.consecutiveAbsents - a.consecutiveAbsents);

        return {
          success: true,
          data: {
            threshold,
            count: alerted.length,
            alertMembers: alerted,
          },
        };
      }

      // 19. Phổ điểm & phân bổ xếp loại học lực / thi đua
      case "get_grade_distribution_summary": {
        const [categories, grades, totalMembers] = await Promise.all([
          prisma.gradeCategory.findMany({ where: { active: true } }),
          prisma.grade.findMany({
            where: {
              year,
              quarter,
              mMember: { active: true, ...(branch && branch !== "all" ? { branch } : {}) },
            },
          }),
          prisma.member.count({ where: { active: true, ...(branch && branch !== "all" ? { branch } : {}) } }),
        ]);

        const catWeightMap = {};
        categories.forEach((c) => {
          catWeightMap[c.id] = c.weight || 1;
        });

        const memberScoreMap = {};
        grades.forEach((g) => {
          if (!memberScoreMap[g.memberId]) {
            memberScoreMap[g.memberId] = { weightedSum: 0, weightTotal: 0 };
          }
          const w = catWeightMap[g.categoryId] || 1;
          memberScoreMap[g.memberId].weightedSum += g.score * w;
          memberScoreMap[g.memberId].weightTotal += w;
        });

        let excellent = 0; // >= 9.0
        let good = 0;      // 8.0 - 8.9
        let fair = 0;      // 6.5 - 7.9
        let average = 0;   // 5.0 - 6.4
        let weak = 0;      // < 5.0

        const scores = Object.values(memberScoreMap).map((m) =>
          m.weightTotal > 0 ? Number((m.weightedSum / m.weightTotal).toFixed(1)) : 0
        );

        scores.forEach((s) => {
          if (s >= 9.0) excellent++;
          else if (s >= 8.0) good++;
          else if (s >= 6.5) fair++;
          else if (s >= 5.0) average++;
          else weak++;
        });

        const gradedCount = scores.length;
        const unratedCount = Math.max(0, totalMembers - gradedCount);

        return {
          success: true,
          data: {
            year,
            quarter,
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            totalMembers,
            gradedCount,
            unratedCount,
            distribution: [
              { tier: "Xuất Sắc (>= 9.0)", count: excellent, percentage: gradedCount > 0 ? ((excellent / gradedCount) * 100).toFixed(1) + "%" : "0%" },
              { tier: "Giỏi (8.0 - 8.9)", count: good, percentage: gradedCount > 0 ? ((good / gradedCount) * 100).toFixed(1) + "%" : "0%" },
              { tier: "Khá (6.5 - 7.9)", count: fair, percentage: gradedCount > 0 ? ((fair / gradedCount) * 100).toFixed(1) + "%" : "0%" },
              { tier: "Trung Bình (5.0 - 6.4)", count: average, percentage: gradedCount > 0 ? ((average / gradedCount) * 100).toFixed(1) + "%" : "0%" },
              { tier: "Yếu (< 5.0)", count: weak, percentage: gradedCount > 0 ? ((weak / gradedCount) * 100).toFixed(1) + "%" : "0%" },
            ],
          },
        };
      }

      // 20. Sự kiện, ngày hội, hoạt động phong trào sắp diễn ra
      case "get_upcoming_events": {
        const now = new Date();
        const activities = await prisma.activity.findMany({
          where: {
            date: { gte: now },
          },
          take: 5,
          orderBy: { date: "asc" },
          include: { createdBy: { select: { name: true } } },
        });

        const fallbackActs = activities.length > 0 ? activities : await prisma.activity.findMany({
          where: { year, quarter },
          take: 5,
          orderBy: { date: "desc" },
          include: { createdBy: { select: { name: true } } },
        });

        return {
          success: true,
          data: {
            count: fallbackActs.length,
            events: fallbackActs.map((a) => ({
              id: a.id,
              name: a.name,
              date: new Date(a.date).toLocaleDateString("vi-VN"),
              organizer: a.createdBy?.name || "Ban Quản Trị",
              quarter: a.quarter,
              year: a.year,
            })),
          },
        };
      }

      // 21. Lịch sử tham gia ngoại khóa của từng đoàn sinh
      case "get_member_activity_history": {
        const memberQuery = (args.query || "").trim();
        const member = await prisma.member.findFirst({
          where: {
            active: true,
            name: { contains: memberQuery, mode: "insensitive" },
          },
          include: {
            activityAttendances: {
              include: { activity: true },
              orderBy: { activity: { date: "desc" } },
            },
          },
        });

        if (!member) {
          return { success: false, error: `Không tìm thấy đoàn sinh tên '${memberQuery}'` };
        }

        const totalActivities = await prisma.activity.count();
        const attended = member.activityAttendances.filter((a) => a.status === "PRESENT");

        return {
          success: true,
          data: {
            memberId: member.id,
            memberName: member.name,
            branch: member.branch ? "Ngành " + member.branch : "—",
            group: member.group || "—",
            totalActivitiesJoined: attended.length,
            totalSystemActivities: totalActivities,
            participationRate: totalActivities > 0 ? ((attended.length / totalActivities) * 100).toFixed(1) + "%" : "0%",
            activityList: member.activityAttendances.map((a) => ({
              activityName: a.activity?.name,
              date: a.activity?.date ? new Date(a.activity.date).toLocaleDateString("vi-VN") : "—",
              status: a.status === "PRESENT" ? "Có tham gia" : "Vắng",
            })),
          },
        };
      }

      // 22. Thống kê đoàn sinh mới gia nhập & lịch sử chuyển ngành
      case "get_promotion_and_new_members": {
        const filterYear = args.year ? Number(args.year) : null;
        const memberWhere = {
          active: true,
          ...(branch && branch !== "all" ? { branch } : {}),
        };

        if (filterYear) {
          memberWhere.OR = [
            { startYear: filterYear },
            {
              startDate: {
                gte: new Date(filterYear, 0, 1),
                lte: new Date(filterYear, 11, 31, 23, 59, 59),
              },
            },
          ];
        }

        const promoWhere = {};
        if (filterYear) {
          promoWhere.date = {
            gte: new Date(filterYear, 0, 1),
            lte: new Date(filterYear, 11, 31, 23, 59, 59),
          };
        }

        const [promotions, newMembers, totalJoinedInYear] = await Promise.all([
          prisma.memberStatusHistory.findMany({
            where: promoWhere,
            take: 15,
            orderBy: { date: "desc" },
            include: { member: { select: { id: true, name: true, branch: true } } },
          }),
          prisma.member.findMany({
            where: memberWhere,
            take: 20,
            orderBy: [{ startYear: "desc" }, { startDate: "desc" }, { name: "asc" }],
            select: { id: true, name: true, branch: true, group: true, parish: true, startYear: true, startDate: true },
          }),
          filterYear ? prisma.member.count({ where: memberWhere }) : null,
        ]);

        return {
          success: true,
          data: {
            filterYear: filterYear || "Tất cả các năm gần đây",
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            totalEnrolledInYear: filterYear ? totalJoinedInYear : newMembers.length,
            newlyEnrolledMembers: newMembers.map((m) => ({
              memberName: m.name,
              branch: m.branch ? "Ngành " + m.branch : "—",
              group: m.group || "—",
              parish: m.parish || "—",
              startYear: m.startYear ? `Năm ${m.startYear}` : "—",
              startDate: m.startDate ? new Date(m.startDate).toLocaleDateString("vi-VN") : "Chưa cập nhật ngày",
            })),
            recentPromotions: promotions.map((p) => ({
              memberName: p.member?.name || "Đoàn sinh",
              type: p.type === "BRANCH_PROMOTED" ? "Thăng cấp lên ngành" : p.type,
              date: p.date ? new Date(p.date).toLocaleDateString("vi-VN") : "—",
              fromBranch: p.fromBranch ? "Ngành " + p.fromBranch : "—",
              toBranch: p.toBranch ? "Ngành " + p.toBranch : "—",
              note: p.note || "—",
            })),
          },
        };
      }

      // 23. Cơ cấu phân chia Đội / Chi đoàn nội bộ
      case "get_group_squad_distribution": {
        const groups = await prisma.member.groupBy({
          by: ["branch", "group"],
          where: { active: true, ...(branch && branch !== "all" ? { branch } : {}) },
          _count: { id: true },
          orderBy: { branch: "asc" },
        });

        return {
          success: true,
          data: {
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            totalGroups: groups.length,
            groups: groups.map((g) => ({
              branch: g.branch ? "Ngành " + g.branch : "Chưa phân ngành",
              groupName: g.group || "Chưa xếp đội/chi đoàn",
              memberCount: g._count.id,
            })),
          },
        };
      }

      // 24. Thống kê mức độ cống hiến của trưởng
      case "get_leaders_contribution_stats": {
        const users = await prisma.user.findMany({
          where: { active: true, ...(branch && branch !== "all" ? { branch } : {}) },
          include: {
            _count: {
              select: {
                activitiesCreated: true,
                sessionsCreated: true,
                attendancesMarked: true,
              },
            },
          },
          orderBy: { sumEvent: "desc" },
        });

        return {
          success: true,
          data: {
            count: users.length,
            leaderStats: users.map((u) => ({
              name: u.name,
              role: u.role || "trưởng",
              branch: u.branch ? "Ngành " + u.branch : "Toàn Gia Đình Hưng Đạo Trung Nam",
              eventsOrganized: u.sumEvent || u._count.activitiesCreated || 0,
              sessionsCreated: u._count.sessionsCreated || 0,
              attendancesMarked: u._count.attendancesMarked || 0,
              startYear: u.startYear ? new Date(u.startYear).getFullYear() : "—",
              yearsActive: u.startYear ? new Date().getFullYear() - new Date(u.startYear).getFullYear() : 0,
            })),
          },
        };
      }

      // 25. Quy chế chấm điểm, danh mục môn học & hệ số môn
      case "get_scoring_rules_and_weights": {
        const categories = await prisma.gradeCategory.findMany({
          where: { active: true },
          orderBy: { weight: "desc" },
        });

        const totalWeight = categories.reduce((sum, c) => sum + (c.weight || 1), 0);

        return {
          success: true,
          data: {
            totalCategories: categories.length,
            totalWeight,
            scoringMethod: "Điểm trung bình học tập/thi đua = Tổng(Điểm từng môn * Hệ số môn) / Tổng hệ số các môn.",
            categories: categories.map((c) => ({
              id: c.id,
              subjectName: c.name,
              weight: c.weight,
              percentageContribution: totalWeight > 0 ? (((c.weight || 1) / totalWeight) * 100).toFixed(1) + "%" : "—",
              description: `Môn ${c.name} chiếm hệ số ${c.weight} trong cơ cấu tính điểm thi đua quý.`,
            })),
          },
        };
      }

      // 26. Báo cáo tổng kết toàn diện cả năm học
      case "get_yearly_summary_report": {
        const targetYear = args.year ? Number(args.year) : currentYear;
        const [totalMembers, allSessions, allActivities, allPromotions] = await Promise.all([
          prisma.member.count({ where: { active: true, ...(branch && branch !== "all" ? { branch } : {}) } }),
          prisma.session.findMany({
            where: {
              date: {
                gte: new Date(targetYear, 0, 1),
                lte: new Date(targetYear, 11, 31, 23, 59, 59),
              },
              ...(branch && branch !== "all" ? { branch } : {}),
            },
            include: { attendances: true },
          }),
          prisma.activity.findMany({
            where: { year: targetYear },
          }),
          prisma.memberStatusHistory.count({
            where: {
              type: "BRANCH_PROMOTED",
              date: {
                gte: new Date(targetYear, 0, 1),
                lte: new Date(targetYear, 11, 31, 23, 59, 59),
              },
            },
          }),
        ]);

        let totalVisitsPossible = 0;
        let totalAbsents = 0;
        for (const s of allSessions) {
          totalVisitsPossible += totalMembers;
          totalAbsents += s.attendances.length;
        }
        const totalPresents = Math.max(0, totalVisitsPossible - totalAbsents);
        const yearlyAttendanceRate = totalVisitsPossible > 0 ? ((totalPresents / totalVisitsPossible) * 100).toFixed(1) + "%" : "—";

        return {
          success: true,
          data: {
            year: targetYear,
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            totalActiveMembers: totalMembers,
            totalSessionsHeld: allSessions.length,
            totalActivitiesOrganized: allActivities.length,
            promotedMembersCount: allPromotions,
            yearlyAttendanceRate,
            activities: allActivities.map((a) => a.name),
          },
        };
      }

      // 26. Tỷ lệ trưởng / Đoàn sinh (Leader-to-Member Ratio)
      case "get_leader_to_member_ratio": {
        const [leaders, members] = await Promise.all([
          prisma.user.findMany({ where: { role: { not: "admin" } }, select: { branch: true } }),
          prisma.member.findMany({ where: { active: true }, select: { branch: true } }),
        ]);

        const branchesList = ["Đồng", "Thiếu", "Thanh"];
        const stats = branchesList.map((b) => {
          const lCount = leaders.filter((l) => l.branch === b).length;
          const mCount = members.filter((m) => m.branch === b).length;
          const ratio = lCount > 0 ? (mCount / lCount).toFixed(1) : "N/A";
          let assessment = "Chuẩn sư phạm (1 HT / 8-10 ĐS)";
          if (lCount === 0) assessment = "Thiếu trưởng";
          else if (mCount / lCount > 15) assessment = "Cần tăng cường thêm trưởng";
          else if (mCount / lCount <= 7) assessment = "Rất tối ưu, chăm sóc kèm cặp sát sao";

          return {
            branch: "Ngành " + b,
            leaderCount: lCount,
            memberCount: mCount,
            ratio: lCount > 0 ? `1 HT / ${ratio} ĐS` : "Chưa có HT",
            assessment,
          };
        });

        const totalL = leaders.length;
        const totalM = members.length;
        const totalRatio = totalL > 0 ? (totalM / totalL).toFixed(1) : "N/A";

        return {
          success: true,
          data: {
            totalLeaders: totalL,
            totalMembers: totalM,
            overallRatio: `1 HT / ${totalRatio} ĐS`,
            branches: stats,
          },
        };
      }

      // 27. Sức khỏe cơ sở dữ liệu & Mức độ hoàn thiện hồ sơ
      case "get_system_health_and_data_summary": {
        const [activeCount, inactiveCount, allMembers, sessionCount, gradeCount] = await Promise.all([
          prisma.member.count({ where: { active: true } }),
          prisma.member.count({ where: { active: false } }),
          prisma.member.findMany({ select: { contact: true, birthDate: true, parish: true, church: true, fatherName: true } }),
          prisma.session.count(),
          prisma.grade.count(),
        ]);

        const total = allMembers.length || 1;
        const withContact = allMembers.filter((m) => m.contact && m.contact !== "-" && m.contact.trim()).length;
        const withBirthDate = allMembers.filter((m) => m.birthDate).length;
        const withParish = allMembers.filter((m) => m.parish && m.parish !== "-" && m.parish.trim()).length;
        const withParent = allMembers.filter((m) => m.fatherName && m.fatherName !== "-" && m.fatherName.trim()).length;

        return {
          success: true,
          data: {
            totalMembers: allMembers.length,
            activeMembers: activeCount,
            inactiveMembers: inactiveCount,
            totalSessionsRecorded: sessionCount,
            totalGradesRecorded: gradeCount,
            completenessMetrics: {
              contactRatio: `${((withContact / total) * 100).toFixed(1)}% (${withContact}/${total})`,
              birthDateRatio: `${((withBirthDate / total) * 100).toFixed(1)}% (${withBirthDate}/${total})`,
              parishRatio: `${((withParish / total) * 100).toFixed(1)}% (${withParish}/${total})`,
              parentNameRatio: `${((withParent / total) * 100).toFixed(1)}% (${withParent}/${total})`,
            },
          },
        };
      }

      // 32. Danh bạ đại diện liên lạc chính thức từng ngành
      case "get_branch_contact_representatives": {
        const users = await prisma.user.findMany({
          where: { active: true },
          select: { id: true, name: true, role: true, branch: true, email: true },
          orderBy: { role: "asc" },
        });

        const representatives = users.map((u) => ({
          name: u.name,
          role: u.role === "admin" ? "Ban Quản Trị (Admin)" : u.role || "trưởng",
          branch: u.branch ? "Ngành " + u.branch : "Toàn Gia Đình Hưng Đạo",
          email: u.email || "—",
        }));

        return {
          success: true,
          data: {
            count: representatives.length,
            representatives,
          },
        };
      }

      // 33. Tìm các cặp anh chị em ruột trong gia đình (dựa trên Cùng Tên Cha, Cùng Tên Mẹ hoặc Cùng SĐT Phụ Huynh)
      case "get_sibling_family_groups": {
        const members = await prisma.member.findMany({
          where: { active: true },
          select: { id: true, name: true, branch: true, group: true, contact: true, fatherName: true, motherName: true, address: true, birthDate: true },
        });

        const normalize = (str) => {
          if (!str || str === "-" || !str.trim()) return "";
          return str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
        };

        // Nhóm theo Khóa cha mẹ hoặc SĐT
        const familyMap = {};

        for (const m of members) {
          const f = normalize(m.fatherName);
          const mo = normalize(m.motherName);
          const phone = (m.contact || "").replace(/\D/g, "");

          let key = "";
          if (f && mo) {
            key = `f_${f}__m_${mo}`;
          } else if (f && f.length >= 3) {
            key = `f_${f}`;
          } else if (mo && mo.length >= 3) {
            key = `m_${mo}`;
          } else if (phone && phone.length >= 7) {
            key = `phone_${phone}`;
          }

          if (key) {
            if (!familyMap[key]) familyMap[key] = [];
            // Tránh trùng lặp đoàn sinh trong cùng 1 nhóm
            if (!familyMap[key].some((x) => x.id === m.id)) {
              familyMap[key].push(m);
            }
          }
        }

        const siblingGroups = Object.entries(familyMap)
          .filter(([, list]) => list.length >= 2)
          .map(([, list]) => {
            const first = list[0];
            const father = list.find((x) => x.fatherName && x.fatherName !== "-")?.fatherName;
            const mother = list.find((x) => x.motherName && x.motherName !== "-")?.motherName;
            const parentName = [father ? `Bố: ${father}` : "", mother ? `Mẹ: ${mother}` : ""].filter(Boolean).join(" & ") || "Chưa cập nhật";
            const contact = list.find((x) => x.contact && x.contact !== "-")?.contact || "—";
            const address = list.find((x) => x.address && x.address !== "-")?.address || "—";

            return {
              parentName,
              familyContact: contact,
              address,
              childrenCount: list.length,
              children: list.map((c) => {
                const birthYear = c.birthDate ? new Date(c.birthDate).getFullYear() : null;
                const age = birthYear ? currentYear - birthYear : null;
                return {
                  name: c.name,
                  branch: "Ngành " + c.branch,
                  group: c.group || "—",
                  birthYear: birthYear || "—",
                  age: age ? `${age} tuổi` : "—",
                };
              }),
            };
          })
          .sort((a, b) => b.childrenCount - a.childrenCount);

        return {
          success: true,
          data: {
            totalFamiliesWithMultipleChildren: siblingGroups.length,
            totalChildrenInSiblingGroups: siblingGroups.reduce((acc, g) => acc + g.childrenCount, 0),
            note: "Dữ liệu được xác định tự động dựa trên trùng khớp Họ tên Bố/Mẹ và Số điện thoại liên hệ.",
            families: siblingGroups,
          },
        };
      }

      // 34. Danh sách đoàn sinh đã nghỉ hoặc tạm ngưng sinh hoạt
      case "get_inactive_and_dropped_members": {
        const where = { active: false };
        if (branch !== "all") where.branch = branch;

        const inactiveMembers = await prisma.member.findMany({
          where,
          select: { id: true, name: true, branch: true, group: true, parish: true, church: true, contact: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
        });

        return {
          success: true,
          data: {
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            count: inactiveMembers.length,
            members: inactiveMembers.map((m) => ({
              name: m.name,
              branch: "Ngành " + m.branch,
              group: m.group || "—",
              parish: m.parish || "—",
              phone: m.contact || "—",
              lastUpdated: new Date(m.updatedAt).toLocaleDateString("vi-VN"),
            })),
          },
        };
      }

      // 35. Mức độ chuẩn bị bài học & giáo án Quý (Microservice Program)
      case "get_lesson_preparation_readiness": {
        const targetYear = year || new Date().getFullYear();
        const targetQuarter = quarter || (Math.floor(new Date().getMonth() / 3) + 1);

        let programs = [];
        const serviceToken = jwt.sign(
          {
            userId: userContext?.id || userContext?.userId || 1,
            email: userContext?.email || "ai-service@trungnam.org",
            role: userContext?.role || "admin",
            branch: userContext?.branch || null,
          },
          JWT_SECRET,
          { expiresIn: "10m" }
        );

        try {
          const pRes = await axios.get(`${PROGRAM_SERVER_URL}/api/v1/programs`, {
            params: { year: targetYear, quarter: targetQuarter },
            headers: { Authorization: `Bearer ${serviceToken}` },
            timeout: 10000,
          });
          programs = pRes.data?.data?.programs || pRes.data?.data || [];
        } catch (err) {
          console.warn("Could not query program server for readiness:", err.message);
        }

        const filtered = programs.filter((p) => {
          if (p.year && Number(p.year) !== Number(targetYear)) return false;
          if (p.quarter && Number(p.quarter) !== Number(targetQuarter)) return false;
          const pBranch = p.branch?.name || p.branchId;
          if (branch && branch !== "all" && pBranch !== branch) return false;
          return true;
        });

        let totalLessons = 0;
        let preparedCount = 0;
        let assignedLeaderCount = 0;
        let withFilesCount = 0;
        const lessonList = [];

        for (const prog of filtered) {
          try {
            const detailRes = await axios.get(`${PROGRAM_SERVER_URL}/api/v1/programs/${prog.id}`, {
              headers: { Authorization: `Bearer ${serviceToken}` },
              timeout: 10000,
            });
            const fullProg = detailRes.data?.data || prog;
            const branchName = fullProg.branch?.name || fullProg.branchId || prog.branchId || "—";
            const lessons = fullProg.lessons || [];

            totalLessons += lessons.length;
            for (const l of lessons) {
              const leaders = (l.leaders || []).map((ldr) => ldr.name).filter(Boolean);
              const files = (l.files || []).map((f) => f.fileName || f.originalName).filter(Boolean);
              if (l.prepared) preparedCount++;
              if (leaders.length > 0) assignedLeaderCount++;
              if (files.length > 0) withFilesCount++;

              lessonList.push({
                lessonText: l.lessonText || "Bài học",
                branch: branchName,
                date: l.date ? new Date(l.date).toLocaleDateString("vi-VN") : "—",
                category: l.commonProgram?.name || "Kỹ năng / Giáo luật",
                location: l.location?.name || "Báo Ân Đường",
                duration: l.durationMinutes ? `${l.durationMinutes} phút` : "90 phút",
                prepared: l.prepared ? "Đã chuẩn bị" : (leaders.length > 0 && files.length > 0 ? "Đã sẵn sàng" : "Chưa hoàn tất"),
                leaders: leaders.length > 0 ? leaders.join(", ") : "Chưa phân công",
                filesCount: files.length,
                files: files.join(", ") || "Chưa có tài liệu",
              });
            }
          } catch (err) {
            console.warn(`Error fetching program ${prog.id} details:`, err.message);
          }
        }

        const readinessRate = totalLessons > 0 ? `${Math.round(((assignedLeaderCount + withFilesCount) / (totalLessons * 2)) * 100)}%` : "0%";

        return {
          success: true,
          data: {
            year: targetYear,
            quarter: targetQuarter,
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            totalPrograms: filtered.length,
            programStatus: filtered.map((p) => `${p.branch?.name || p.branchId || "Ngành"}: ${p.status || "DRAFT"}`).join(", "),
            totalLessons,
            preparedCount,
            assignedLeaderCount,
            withFilesCount,
            readinessRate,
            lessons: lessonList,
          },
        };
      }

      // 36. Điểm bất thường / Chênh lệch điểm lớn giữa các môn
      case "get_grade_outliers_and_anomalies": {
        const where = { active: true };
        if (branch !== "all") where.branch = branch;

        const members = await prisma.member.findMany({
          where,
          include: {
            grades: {
              where: { year, quarter },
              include: { category: true },
            },
          },
        });

        const anomalies = [];
        for (const m of members) {
          if (!m.grades || m.grades.length < 2) continue;
          const scores = m.grades.map((g) => g.score);
          const max = Math.max(...scores);
          const min = Math.min(...scores);
          const gap = max - min;
          const lowScores = m.grades.filter((g) => g.score < 5.0);

          if (gap >= 4.0 || lowScores.length > 0) {
            anomalies.push({
              name: m.name,
              branch: "Ngành " + m.branch,
              group: m.group || "—",
              maxScore: max,
              minScore: min,
              gap: gap.toFixed(1),
              grades: m.grades.map((g) => `${g.category?.name || "Môn"}: ${g.score}`),
              reason: gap >= 4.0 ? `Chênh lệch môn cao nhất và thấp nhất lên tới ${gap.toFixed(1)} điểm` : "Có môn đạt điểm dưới trung bình (<5.0)",
            });
          }
        }

        return {
          success: true,
          data: {
            year,
            quarter,
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            count: anomalies.length,
            anomalies: anomalies.sort((a, b) => b.gap - a.gap).slice(0, 10),
          },
        };
      }

      // 37. Tra cứu nhật ký chi tiết của 1 buổi sinh hoạt
      case "get_session_detailed_history": {
        const targetBranch = branch === "all" ? "Thiếu" : branch;
        let session;

        if (args.date) {
          const parsedDate = new Date(args.date);
          session = await prisma.session.findFirst({
            where: { branch: targetBranch, date: parsedDate },
            include: {
              attendances: {
                include: { member: { select: { name: true, group: true, parish: true, contact: true } } },
              },
            },
          });
        }

        if (!session) {
          session = await prisma.session.findFirst({
            where: { branch: targetBranch },
            orderBy: { date: "desc" },
            include: {
              attendances: {
                include: { member: { select: { name: true, group: true, parish: true, contact: true } } },
              },
            },
          });
        }

        if (!session) {
          return { success: false, error: `Chưa có dữ liệu buổi sinh hoạt nào của Ngành ${targetBranch}.` };
        }

        const activeTotal = await prisma.member.count({ where: { branch: targetBranch, active: true } });
        const absents = session.attendances.map((att) => ({
          name: att.member.name,
          group: att.member.group || "—",
          status: att.status === "absent" ? "Vắng không phép" : att.status === "excused" ? "Vắng có phép" : "Đi trễ",
          phone: att.member.contact || "—",
        }));

        return {
          success: true,
          data: {
            date: new Date(session.date).toLocaleDateString("vi-VN"),
            branch: "Ngành " + session.branch,
            totalActiveMembers: activeTotal,
            absentCount: session.attendances.length,
            presentCount: Math.max(0, activeTotal - session.attendances.length),
            attendanceRate: activeTotal > 0 ? `${(((activeTotal - session.attendances.length) / activeTotal) * 100).toFixed(1)}%` : "0%",
            attendanceRecords: absents,
          },
        };
      }

      // 38. Phân tích chuyên cần theo ngày trong tuần
      case "get_attendance_by_day_of_week": {
        const where = {
          date: {
            gte: new Date(year, 0, 1),
            lte: new Date(year, 11, 31, 23, 59, 59),
          },
        };
        if (branch !== "all") where.branch = branch;

        const sessions = await prisma.session.findMany({
          where,
          include: { attendances: true },
        });

        const dayNames = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
        const dayStats = {};

        for (const s of sessions) {
          const dayIdx = new Date(s.date).getDay();
          const dayName = dayNames[dayIdx];
          if (!dayStats[dayName]) dayStats[dayName] = { count: 0, totalAbsents: 0 };
          dayStats[dayName].count++;
          dayStats[dayName].totalAbsents += s.attendances.length;
        }

        return {
          success: true,
          data: {
            year,
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            totalSessions: sessions.length,
            distribution: Object.entries(dayStats).map(([day, st]) => ({
              day,
              sessionsCount: st.count,
              averageAbsentsPerSession: st.count > 0 ? (st.totalAbsents / st.count).toFixed(1) : 0,
            })),
          },
        };
      }

      // 39. Rà soát thành viên / trưởng chưa được phân công
      case "get_unassigned_members_and_leaders": {
        const memberWhere = {
          active: true,
          OR: [{ group: null }, { group: "" }, { group: "-" }],
        };
        const churchWhere = {
          active: true,
          OR: [{ church: null }, { church: "" }, { church: "-" }],
        };
        if (branch !== "all") {
          memberWhere.branch = branch;
          churchWhere.branch = branch;
        }

        const [unassignedMembers, unassignedLeaders, missingChurchMembers, totalBranchMembers] = await Promise.all([
          prisma.member.findMany({
            where: memberWhere,
            select: { id: true, name: true, branch: true, parish: true, contact: true },
            orderBy: { name: "asc" },
          }),
          prisma.user.findMany({
            where: { active: true, role: { not: "admin" }, ...(branch !== "all" ? { branch } : { branch: null }) },
            select: { id: true, name: true, email: true },
          }),
          prisma.member.findMany({
            where: churchWhere,
            select: { id: true, name: true, branch: true, parish: true },
            orderBy: { name: "asc" },
          }),
          prisma.member.count({
            where: { active: true, ...(branch !== "all" ? { branch } : {}) },
          }),
        ]);

        return {
          success: true,
          data: {
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch,
            totalActiveMembersInScope: totalBranchMembers,
            unassignedGroupMembersCount: unassignedMembers.length,
            unassignedLeadersCount: unassignedLeaders.length,
            missingChurchMembersCount: missingChurchMembers.length,
            unassignedMembersList: unassignedMembers.map((m) => ({ name: m.name, branch: "Ngành " + m.branch, parish: m.parish || "—", phone: m.contact || "—" })),
            unassignedLeaders: unassignedLeaders.map((l) => ({ name: l.name, email: l.email })),
          },
        };
      }

      // 40. Thẻ kiểm toán toàn diện 360 độ của 1 đoàn sinh
      case "get_comprehensive_member_audit_card": {
        const searchWords = (args.query || "").trim();
        if (!searchWords) return { success: false, error: "Vui lòng cung cấp tên hoặc mã đoàn sinh." };

        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31, 23, 59, 59);

        const member = await prisma.member.findFirst({
          where: {
            OR: [
              { name: { contains: searchWords, mode: "insensitive" } },
              { id: !isNaN(Number(searchWords)) ? Number(searchWords) : undefined },
            ],
          },
          include: {
            grades: { where: { year }, include: { category: true } },
            attendances: {
              where: {
                date: {
                  gte: startOfYear,
                  lte: endOfYear,
                },
              },
              include: { session: true },
              orderBy: { date: "desc" },
            },
            statusHistory: { orderBy: { createdAt: "desc" } },
          },
        });

        if (!member) {
          return { success: false, error: `Không tìm thấy đoàn sinh phù hợp với từ khóa "${searchWords}".` };
        }

        const totalBranchSessions = await prisma.session.count({
          where: {
            branch: member.branch,
            date: {
              gte: startOfYear,
              lte: endOfYear,
            },
          },
        });
        const absentCount = member.attendances.length;
        const attendanceRate = totalBranchSessions > 0 ? `${(((totalBranchSessions - absentCount) / totalBranchSessions) * 100).toFixed(1)}%` : "100%";

        return {
          success: true,
          data: {
            member: {
              id: member.id,
              name: member.name,
              branch: "Ngành " + member.branch,
              group: member.group || "—",
              birthDate: member.birthDate ? new Date(member.birthDate).toLocaleDateString("vi-VN") : "—",
              gender: member.gender || "—",
              parish: member.parish || "—",
              church: member.church || "—",
              fatherName: member.fatherName || "—",
              motherName: member.motherName || "—",
              contact: member.contact || "—",
              address: member.address || "—",
            },
            yearlyAttendance: {
              year,
              totalSessionsHeld: totalBranchSessions,
              absentOrLateCount: absentCount,
              attendanceRate,
            },
            gradesSummary: member.grades.map((g) => ({
              quarter: `Quý ${g.quarter}`,
              subject: g.category?.name || "Môn học",
              score: g.score,
            })),
            promotionHistory: (member.statusHistory || []).map((h) => ({
              type: h.type,
              from: h.fromBranch ? "Ngành " + h.fromBranch : "Gia nhập",
              to: h.toBranch ? "Ngành " + h.toBranch : "—",
              date: new Date(h.createdAt).toLocaleDateString("vi-VN"),
              note: h.reason || "—",
            })),
          },
        };
      }

      // 38. Cơ cấu tổ chức Gia Đình Hưng Đạo
      case "get_organization_structure": {
        const targetBranch = args.branch || branch || "all";
        const membersWhere = { active: true };
        if (targetBranch !== "all") membersWhere.branch = targetBranch;

        const members = await prisma.member.findMany({
          where: membersWhere,
          select: { id: true, branch: true, group: true },
        });

        const leaders = await prisma.user.findMany({
          where: { active: true },
          select: { id: true, name: true, role: true, branch: true, email: true, phone: true },
          orderBy: { name: "asc" },
        });

        const branchStats = {
          Đồng: { name: "Ngành Đồng (Ấu nhi)", ageRange: "6 - 11 tuổi (Lớp 1 - Lớp 5)", motto: "Vâng Lời", scarfColor: "Xanh lá mạ viền vàng", count: 0, leader: "Vườn Trưởng Đoàn Thị Hoàng Trâm", patron: "Chúa Hài Đồng & Thánh Nữ Têrêsa Hài Đồng Giêsu" },
          Thiếu: { name: "Ngành Thiếu (Thiếu nhi)", ageRange: "12 - 14 tuổi (Lớp 6 - Lớp 8)", motto: "Hy Sinh", scarfColor: "Xanh biển viền vàng", count: 0, leader: "Thiếu Trưởng Nguyễn Đăng Đạo", patron: "Thánh Phêrô & Thánh Đaminh Saviô" },
          Thanh: { name: "Ngành Thanh (Nghĩa sĩ)", ageRange: "15 - 18 tuổi (Lớp 9 - Lớp 12)", motto: "Chinh Phục / Dấn Thân", scarfColor: "Vàng nghệ viền đỏ", count: 0, leader: "Thanh Trưởng Nguyễn Anh Nhật Vũ", patron: "Thánh Phaolô Tông Đồ" },
        };

        members.forEach((m) => {
          if (branchStats[m.branch]) {
            branchStats[m.branch].count++;
          }
        });

        return {
          success: true,
          data: {
            organizationName: "Gia Đình Hưng Đạo Trung Nam",
            movement: "Phong trào Thiếu Nhi Thánh Thể",
            headquarters: "Giáo họ Trung Nam",
            mottos: ["Cầu Nguyện", "Rước Lễ", "Hy Sinh", "Làm Tông Đồ"],
            totalActiveMembers: members.length,
            totalLeaders: leaders.length,
            branchStats: Object.values(branchStats),
            leadersList: leaders,
          },
        };
      }

      // 39. Phân tích chi tiết số liệu chuyên cần
      case "get_attendance_analytics": {
        const targetBranch = args.branch || branch || "all";
        const sessionWhere = {};
        if (targetBranch !== "all") sessionWhere.branch = targetBranch;

        const startMonth = (quarter - 1) * 3;
        const startDate = new Date(year, startMonth, 1);
        const endDate = new Date(year, startMonth + 3, 0, 23, 59, 59);
        sessionWhere.date = { gte: startDate, lte: endDate };

        const sessions = await prisma.session.findMany({
          where: sessionWhere,
          orderBy: { date: "asc" },
        });

        const sessionIds = sessions.map((s) => s.id);
        const attendances = await prisma.attendance.findMany({
          where: { sessionId: { in: sessionIds } },
        });

        const memberWhere = { active: true };
        if (targetBranch !== "all") memberWhere.branch = targetBranch;
        const totalActive = await prisma.member.count({ where: memberWhere });

        const totalSessions = sessions.length;
        const totalPossible = totalSessions * (totalActive || 1);

        let absentCount = 0;
        let lateCount = 0;
        let excusedCount = 0;

        attendances.forEach((a) => {
          const st = (a.status || "").toLowerCase();
          if (st === "absent") absentCount++;
          else if (st === "late") lateCount++;
          else if (st === "excused") excusedCount++;
        });

        const weightedAbsence = absentCount * 1.0 + lateCount * 0.5 + excusedCount * 0.2;
        const estimatedPresent = Math.max(0, totalPossible - (absentCount + lateCount + excusedCount));
        const attendanceRate = totalPossible > 0
          ? Math.max(0, Math.min(100, (((totalPossible - weightedAbsence) / totalPossible) * 100))).toFixed(1)
          : "100.0";
        const avgScore = (parseFloat(attendanceRate) / 10).toFixed(1);

        return {
          success: true,
          data: {
            year,
            quarter,
            branch: targetBranch,
            totalActiveMembers: totalActive,
            totalSessions,
            totalPossibleAttendances: totalPossible,
            estimatedPresent,
            absentCount,
            lateCount,
            excusedCount,
            attendanceRate: `${attendanceRate}%`,
            averageScore: avgScore,
            formula: "AttendanceRate = ((Tổng lượt - (Vắng*1 + Trễ*0.5 + Phép*0.2)) / Tổng lượt) * 100",
          },
        };
      }

      // 40. Phân bố theo Giáo xứ/Họ Đạo & Giáo họ/Xã đạo
      case "get_church_parish_breakdown": {
        const targetBranch = args.branch || branch || "all";
        const where = { active: true };
        if (targetBranch !== "all") where.branch = targetBranch;

        const members = await prisma.member.findMany({
          where,
          select: { id: true, name: true, parish: true, church: true, branch: true, group: true },
        });

        const parishCounts = {};
        const churchCounts = {};

        members.forEach((m) => {
          const p = m.parish && m.parish.trim() && m.parish !== "-" ? m.parish.trim() : "Chưa cập nhật";
          const c = m.church && m.church.trim() && m.church !== "-" ? m.church.trim() : "Chưa cập nhật";
          parishCounts[p] = (parishCounts[p] || 0) + 1;
          churchCounts[c] = (churchCounts[c] || 0) + 1;
        });

        const total = members.length;
        const parishRanking = Object.entries(parishCounts)
          .map(([name, count]) => ({
            name,
            count,
            percentage: ((count / (total || 1)) * 100).toFixed(1) + "%",
          }))
          .sort((a, b) => b.count - a.count);

        const churchRanking = Object.entries(churchCounts)
          .map(([name, count]) => ({
            name,
            count,
            percentage: ((count / (total || 1)) * 100).toFixed(1) + "%",
          }))
          .sort((a, b) => b.count - a.count);

        return {
          success: true,
          data: {
            totalMembers: total,
            branch: targetBranch,
            parishRanking,
            churchRanking,
            topParish: parishRanking[0] || null,
            topChurch: churchRanking[0] || null,
          },
        };
      }

      // 41. Hỏi đáp & Quy chế (FAQs & Guidelines)
      case "get_faqs_and_guidelines": {
        const category = args.category || "all";
        const faqs = [
          {
            category: "schedule",
            question: "Thời gian và địa điểm sinh hoạt hàng tuần như thế nào?",
            answer: "Sinh hoạt định kỳ vào mỗi chiều Chúa Nhật hàng tuần (từ 14h30 đến 17h00) tại khuôn viên Giáo họ Trung Nam. Các em tham dự Thánh lễ, chào cờ, học giáo lý theo ngành và sinh hoạt trò chơi kỹ năng hàng đội.",
          },
          {
            category: "uniform",
            question: "Quy định đồng phục của đoàn sinh và các ngành?",
            answer: "Đoàn sinh mặc áo sơ mi trắng ngắn tay có thêu phù hiệu TNTT trên ngực trái, quần tây (hoặc váy cho nữ) màu xanh đen sẫm, mang giày ba-ta hoặc quai hậu. Đeo khăn quàng đúng cấp ngành: Ngành Đồng (xanh lá mạ viền vàng), Ngành Thiếu (xanh biển viền vàng), Ngành Thanh (vàng nghệ viền đỏ).",
          },
          {
            category: "motto",
            question: "Bốn tôn chỉ của Phong trào Thiếu Nhi Thánh Thể là gì?",
            answer: "Bốn tôn chỉ cốt lõi: 1. Cầu Nguyện (sống kết hợp mật thiết với Chúa) - 2. Rước Lễ (siêng năng đón rước Thánh Thể) - 3. Hy Sinh (vui tươi vượt khó, hy sinh bản thân) - 4. Làm Tông Đồ (làm gương sáng, đem Tin Mừng lan tỏa khắp nơi).",
          },
          {
            category: "attendance",
            question: "Quy chế điểm danh, xin phép vắng và xử lý trễ giờ?",
            answer: "Điểm danh theo cơ chế ngoại lệ. Vắng có phép tính quy đổi 0.2 buổi, đi trễ tính 0.5 buổi, vắng không phép tính 1.0 buổi. Nếu vắng, phụ huynh/đoàn sinh cần báo trước qua điện thoại hoặc nhóm Zalo cho Trưởng phụ trách ít nhất 2 giờ. Đoàn sinh vắng từ 2 buổi liên tiếp sẽ được Trưởng liên hệ thăm hỏi.",
          },
          {
            category: "tuition",
            question: "Chi phí tham gia sinh hoạt hoặc học phí có tốn không?",
            answer: "Sinh hoạt tại Gia Đình Hưng Đạo Trung Nam là HOÀN TOÀN MIỄN PHÍ. Ban Trưởng phục vụ thiện nguyện và các hoạt động được sự bảo trợ của Giáo họ Trung Nam.",
          },
          {
            category: "registration",
            question: "Cách thức đăng ký gia nhập cho đoàn sinh mới?",
            answer: "Phụ huynh có thể liên hệ trực tiếp Ban Trưởng vào đầu giờ chiều Chúa Nhật hoặc gửi thông tin (Họ tên, ngày sinh, tên phụ huynh, SĐT, Xã đạo) để được hướng dẫn xếp ngành phù hợp theo độ tuổi.",
          },
        ];

        const filtered = category === "all" ? faqs : faqs.filter((f) => f.category === category);
        return {
          success: true,
          data: {
            category,
            totalFaqs: filtered.length,
            faqs: filtered,
          },
        };
      }

      // 42. Lộ trình giáo lý & Mục tiêu sư phạm 3 ngành
      case "get_branch_curriculum_overview": {
        const targetBranch = args.branch || branch || "all";
        const curriculum = [
          {
            branch: "Đồng",
            title: "Ngành Đồng (Ấu nhi)",
            age: "6 - 11 tuổi (Lớp 1 đến Lớp 5)",
            motto: "Vâng Lời",
            scarf: "Xanh lá mạ viền vàng (mầm non, tươi vui, hy vọng)",
            patron: "Chúa Hài Đồng & Thánh Nữ Têrêsa Hài Đồng Giêsu",
            leader: "Vườn Trưởng Đoàn Thị Hoàng Trâm",
            pedagogyFocus: "Sư phạm giáo dục tâm tình vâng phục, ngây thơ, yêu thương gia đình, cầu nguyện đơn sơ.",
            coreSubjects: ["Giáo lý Khai Tâm & Xưng Tội Rước Lễ Lần Đầu", "Nhân bản sơ cấp", "Ca múa & Trò chơi vận động", "Kỹ năng hàng đội cơ bản"],
          },
          {
            branch: "Thiếu",
            title: "Ngành Thiếu (Thiếu nhi)",
            age: "12 - 14 tuổi (Lớp 6 đến Lớp 8)",
            motto: "Hy Sinh",
            scarf: "Xanh biển viền vàng (biển rộng, trời cao, lý tưởng trong sáng)",
            patron: "Thánh Phêrô & Thánh Đaminh Saviô",
            leader: "Thiếu Trưởng Nguyễn Đăng Đạo",
            pedagogyFocus: "Sư phạm rèn luyện đức tính hy sinh, trung thực, vượt khó, kỷ luật và tinh thần đồng đội.",
            coreSubjects: ["Giáo lý Thêm Sức", "Nhân bản & Đạo đức học đường", "Nút dây, dấu đường, mật thư sơ cấp", "Cứu thương & Sơ cấp cứu"],
          },
          {
            branch: "Thanh",
            title: "Ngành Thanh (Nghĩa sĩ / Hiệp sĩ)",
            age: "15 - 18 tuổi (Lớp 9 đến Lớp 12)",
            motto: "Chinh Phục / Dấn Thân",
            scarf: "Vàng nghệ viền đỏ (ánh sáng đức tin rực rỡ và lòng nhiệt thành)",
            patron: "Thánh Phaolô Tông Đồ",
            leader: "Thanh Trưởng Nguyễn Anh Nhật Vũ",
            pedagogyFocus: "Sư phạm định hướng lý tưởng sống, bảo vệ đức tin, tinh thần dấn thân phục vụ Giáo hội và xã hội.",
            coreSubjects: ["Giáo lý Vào Đời & Kinh Thánh", "Kỹ năng lãnh đạo & Thuyết trình", "Trại sinh tồn, la bàn & Ước đạc", "Tổ chức trò chơi lớn & Công tác xã hội"],
          },
        ];

        const result = targetBranch === "all" ? curriculum : curriculum.filter((c) => c.branch === targetBranch);
        return {
          success: true,
          data: {
            branch: targetBranch,
            curriculum: result,
          },
        };
      }

      // 43. Lịch phụng vụ & Lễ Bổn mạng
      case "get_liturgical_calendar_and_feasts": {
        const feasts = [
          {
            scope: "Gia Đình Hưng Đạo",
            title: "Lễ Chúa Kitô Vua Vũ Trụ",
            date: "Chúa Nhật XXXIV Thường Niên (Cuối tháng 11)",
            meaning: "Bổn mạng toàn thể Gia Đình Hưng Đạo Trung Nam, tôn vinh Chúa Giêsu là Vua ngự trị trong mọi tâm hồn.",
          },
          {
            scope: "Ngành Đồng",
            title: "Lễ Thánh Nữ Têrêsa Hài Đồng Giêsu & Chúa Hài Đồng",
            date: "01/10 & 25/12 (Giáng Sinh)",
            meaning: "Quan thầy Ngành Đồng, noi gương 'con đường thơ ấu thiêng liêng', làm việc nhỏ với tình yêu lớn.",
          },
          {
            scope: "Ngành Thiếu",
            title: "Lễ Thánh Đaminh Saviô & Thánh Phêrô Tông Đồ",
            date: "06/05 & 29/06",
            meaning: "Quan thầy Ngành Thiếu, sống theo châm ngôn 'Thà chết chứ không phạm tội' và kiên vững trong đức tin.",
          },
          {
            scope: "Ngành Thanh",
            title: "Lễ Thánh Phaolô Tông Đồ Trở Lại",
            date: "25/01 & 29/06",
            meaning: "Quan thầy Ngành Thanh, tinh thần hoán cải mãnh liệt, can đảm ra đi loan báo Tin Mừng.",
          },
          {
            scope: "Ban Trưởng",
            title: "Lễ Các Thánh Tử Đạo Việt Nam",
            date: "24/11",
            meaning: "Quan thầy Ban Trưởng, noi gương các bậc tiền nhân anh dũng hy sinh vì đức tin, tận tụy chăm sóc đoàn sinh.",
          },
          {
            scope: "Phong trào Toàn quốc",
            title: "Đại lễ Mình và Máu Thánh Chúa Kitô",
            date: "Chúa Nhật sau Lễ Chúa Ba Ngôi",
            meaning: "Quan thầy Phong trào Thiếu Nhi Thánh Thể toàn quốc, trung tâm của đời sống Thánh Thể.",
          },
        ];

        return {
          success: true,
          data: {
            organization: "Gia Đình Hưng Đạo Trung Nam",
            totalFeasts: feasts.length,
            feasts,
          },
        };
      }

      // 44. Thống kê Hoạt động Cắm trại & Dã ngoại
      case "get_camp_participants_and_activities": {
        const targetBranch = args.branch || branch || "all";
        const activityWhere = { year };
        if (args.quarter) activityWhere.quarter = Number(args.quarter);

        if (args.activityName && typeof args.activityName === "string" && args.activityName.trim()) {
          activityWhere.name = { contains: args.activityName.trim(), mode: "insensitive" };
        }

        const activities = await prisma.activity.findMany({
          where: activityWhere,
          include: {
            attendances: {
              include: {
                member: {
                  select: { id: true, name: true, branch: true, group: true, parish: true },
                },
              },
            },
          },
          orderBy: { date: "desc" },
        });

        const memberWhere = { active: true };
        if (targetBranch !== "all") memberWhere.branch = targetBranch;
        const totalActive = await prisma.member.count({ where: memberWhere });

        const formattedActivities = activities.map((act) => {
          let participants = act.attendances.map((att) => att.member).filter(Boolean);
          if (targetBranch !== "all") {
            participants = participants.filter((m) => m.branch === targetBranch);
          }

          const branchBreakdown = { Đồng: 0, Thiếu: 0, Thanh: 0 };
          participants.forEach((p) => {
            if (branchBreakdown[p.branch] !== undefined) branchBreakdown[p.branch]++;
          });

          const rate = totalActive > 0 ? ((participants.length / totalActive) * 100).toFixed(1) + "%" : "0.0%";

          return {
            id: act.id,
            name: act.name,
            description: act.description || "Hoạt động cắm trại, dã ngoại, sinh hoạt ngoại khóa Gia Đình Hưng Đạo",
            date: new Date(act.date).toLocaleDateString("vi-VN"),
            quarter: act.quarter,
            year: act.year,
            participantCount: participants.length,
            participationRate: rate,
            branchBreakdown,
            participantsList: participants.slice(0, 30).map((p, idx) => ({
              stt: idx + 1,
              id: p.id,
              name: p.name,
              branch: p.branch,
              group: p.group || "Chưa xếp đội",
            })),
          };
        });

        return {
          success: true,
          data: {
            year,
            quarter: args.quarter || "Cả năm",
            branch: targetBranch,
            totalActiveMembers: totalActive,
            totalActivities: activities.length,
            activities: formattedActivities,
          },
        };
      }

      // 45. Sinh nhật sắp tới trong vòng 30 ngày
      case "get_upcoming_birthdays_next_30_days": {
        const targetBranch = args.branch || branch || "all";
        const memberWhere = { active: true, birthDate: { not: null } };
        if (targetBranch !== "all") memberWhere.branch = targetBranch;

        const members = await prisma.member.findMany({
          where: memberWhere,
          select: { id: true, name: true, birthDate: true, branch: true, group: true, parish: true, contact: true },
        });

        const leaders = await prisma.user.findMany({
          where: { active: true, birthDate: { not: null } },
          select: { id: true, name: true, birthDate: true, branch: true, role: true, phone: true },
        });

        const now = new Date();
        const curY = now.getFullYear();
        const allList = [];

        const processItem = (item, isLeader) => {
          const bDate = new Date(item.birthDate);
          if (isNaN(bDate.getTime())) return;

          let nextBday = new Date(curY, bDate.getMonth(), bDate.getDate());
          if (nextBday < new Date(curY, now.getMonth(), now.getDate())) {
            nextBday = new Date(curY + 1, bDate.getMonth(), bDate.getDate());
          }

          const diffTime = nextBday.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays >= 0 && diffDays <= 30) {
            const ageTurning = nextBday.getFullYear() - bDate.getFullYear();
            allList.push({
              id: item.id,
              name: item.name,
              isLeader,
              role: isLeader ? (item.role || "Trưởng") : "Đoàn sinh",
              branch: item.branch || "—",
              group: item.group || "—",
              parish: item.parish || "—",
              contact: item.contact || item.phone || "—",
              birthDateFormatted: `${String(bDate.getDate()).padStart(2, "0")}/${String(bDate.getMonth() + 1).padStart(2, "0")}/${bDate.getFullYear()}`,
              birthdayThisYear: `${String(bDate.getDate()).padStart(2, "0")}/${String(bDate.getMonth() + 1).padStart(2, "0")}`,
              daysLeft: diffDays,
              ageTurning,
            });
          }
        };

        members.forEach((m) => processItem(m, false));
        leaders.forEach((u) => processItem(u, true));

        allList.sort((a, b) => a.daysLeft - b.daysLeft);

        const limit = args.limit ? Number(args.limit) : 25;
        const result = allList.slice(0, limit);

        return {
          success: true,
          data: {
            totalFound: allList.length,
            showing: result.length,
            branch: targetBranch,
            birthdays: result,
          },
        };
      }

      // 46. So sánh chuyên cần 4 Quý
      case "get_attendance_comparison_by_quarter": {
        const targetYear = args.year ? Number(args.year) : year;
        const targetBranch = args.branch || branch || "all";
        const quartersData = [];

        for (let q = 1; q <= 4; q++) {
          const startMonth = (q - 1) * 3;
          const startDate = new Date(targetYear, startMonth, 1);
          const endDate = new Date(targetYear, startMonth + 3, 0, 23, 59, 59);

          const sessionWhere = {
            date: { gte: startDate, lte: endDate },
          };
          if (targetBranch !== "all") sessionWhere.branch = targetBranch;

          const sessions = await prisma.session.findMany({ where: sessionWhere });
          const totalSessions = sessions.length;

          const memberWhere = { active: true };
          if (targetBranch !== "all") memberWhere.branch = targetBranch;
          const totalActive = await prisma.member.count({ where: memberWhere });

          let attendanceRate = "—";
          let absentCount = 0;
          let lateCount = 0;
          let excusedCount = 0;

          if (totalSessions > 0) {
            const sessionIds = sessions.map((s) => s.id);
            const attendances = await prisma.attendance.findMany({
              where: { sessionId: { in: sessionIds } },
            });

            attendances.forEach((a) => {
              const st = (a.status || "").toLowerCase();
              if (st === "absent") absentCount++;
              else if (st === "late") lateCount++;
              else if (st === "excused") excusedCount++;
            });

            const totalPossible = totalSessions * (totalActive || 1);
            const weightedAbsence = absentCount * 1.0 + lateCount * 0.5 + excusedCount * 0.2;
            const rateNum = Math.max(0, Math.min(100, ((totalPossible - weightedAbsence) / (totalPossible || 1)) * 100));
            attendanceRate = rateNum.toFixed(1) + "%";
          }

          quartersData.push({
            quarter: `Quý ${q}/${targetYear}`,
            quarterNumber: q,
            totalSessions,
            totalActiveMembers: totalActive,
            absentCount,
            lateCount,
            excusedCount,
            attendanceRate,
          });
        }

        return {
          success: true,
          data: {
            year: targetYear,
            branch: targetBranch,
            quarters: quartersData,
          },
        };
      }

      // 47. Ghi chú sư phạm & Sức khỏe đoàn sinh
      case "get_member_health_and_notes": {
        const targetBranch = args.branch || branch || "all";
        const where = { active: true };
        if (targetBranch !== "all") where.branch = targetBranch;

        if (args.query && typeof args.query === "string" && args.query.trim()) {
          where.OR = [
            { name: { contains: args.query.trim(), mode: "insensitive" } },
            { address: { contains: args.query.trim(), mode: "insensitive" } },
          ];
        }

        const members = await prisma.member.findMany({
          where,
          include: {
            attendances: {
              where: { note: { not: null } },
              take: 5,
              orderBy: { date: "desc" },
            },
            statusHistory: {
              where: { note: { not: null } },
              take: 5,
              orderBy: { date: "desc" },
            },
          },
          take: 50,
        });

        const notesList = [];
        members.forEach((m) => {
          const notes = [];
          if (m.address && m.address.trim() && m.address !== "-") {
            notes.push({ type: "Địa chỉ / Khu vực", content: m.address });
          }
          (m.attendances || []).forEach((att) => {
            if (att.note && att.note.trim()) {
              notes.push({
                type: "Ghi chú điểm danh",
                date: new Date(att.date).toLocaleDateString("vi-VN"),
                content: att.note,
              });
            }
          });
          (m.statusHistory || []).forEach((sh) => {
            if (sh.note && sh.note.trim()) {
              notes.push({
                type: "Ghi chú thăng cấp / trạng thái",
                date: new Date(sh.date).toLocaleDateString("vi-VN"),
                content: sh.note,
              });
            }
          });

          if (notes.length > 0 || (args.query && args.query.trim())) {
            notesList.push({
              id: m.id,
              name: m.name,
              branch: m.branch,
              group: m.group || "Chưa xếp đội",
              parish: m.parish || "—",
              contact: m.contact || "—",
              fatherName: m.fatherName || "—",
              motherName: m.motherName || "—",
              notes,
            });
          }
        });

        return {
          success: true,
          data: {
            totalFound: notesList.length,
            branch: targetBranch,
            query: args.query || "Tất cả",
            members: notesList,
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`Error executing tool ${toolName}:`, err);
    return { success: false, error: err.message || String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────
function buildSystemPrompt(userContext) {
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;
  const userRole = userContext?.role === "admin" ? "Ban Quản Trị (Admin)" : "Trưởng";
  const branchScope = "Bạn có thể xem toàn bộ dữ liệu tất cả các Ngành (Đồng, Thiếu, Thanh) mà không bị giới hạn. Luôn tra cứu đúng ngành mà người dùng đề cập trong câu hỏi. Nếu không đề cập ngành cụ thể, hãy trả về tổng hợp toàn Gia Đình Hưng Đạo Trung Nam.";

  return `Bạn là Trợ lý AI Phân tích Dữ liệu Toàn diện của Trung Nam Hub, hệ thống quản trị Gia Đình Hưng Đạo Trung Nam (Thiếu Nhi Thánh Thể).
Vai trò người dùng hiện tại: ${userRole}.
${branchScope}

QUY TẮC BẮT BUỘC VỀ DANH XƯNG & THUẬT NGỮ (TUÂN THỦ 100%):
1. TUYỆT ĐỐI KHÔNG SỬ DỤNG TỪ "Huynh trưởng" HOẶC "Huỳnh trưởng" DƯỚI BẤT KỲ HÌNH THỨC NÀO.
2. Xưng hô với người dùng là "Trưởng" hoặc "bạn" (ví dụ: "Trưởng có cần tôi hỗ trợ thêm thông tin gì không?", "Chào bạn...").
3. Khi nhắc đến các anh/chị phụ trách, chỉ gọi là "Trưởng [Tên]" hoặc chức vụ chính thức (ví dụ: "Trưởng Phạm Ngọc Duy", "Trưởng ban hướng dẫn", "Thiếu Trưởng", "Thiếu Phó", "Thanh Trưởng", "Vườn Trưởng", "Ban Quản Trị"...), tuyệt đối KHÔNG thêm chữ "Huynh trưởng".
4. Tên tổ chức luôn là "Gia Đình Hưng Đạo Trung Nam" (hoặc "Trung Nam"), TUYỆT ĐỐI KHÔNG dùng "Xã đoàn ".
5. Không xài "Ban Quản Trị Trung Ương", luôn xài "Ban hướng dẫn".

Nguyên tắc bắt buộc:
1. 100% DỮ LIỆU THỰC TẾ TỪ DATABASE: Mọi thông tin (độ tuổi, năm sinh, sĩ số, chuyên cần, điểm số, nhân sự, giáo án, phê duyệt) BẮT BUỘC phải gọi Công cụ (AI Tools) để truy vấn từ cơ sở dữ liệu. Tuyệt đối không tự suy diễn hoặc dùng kiến thức lý thuyết chung ngoài đời.
2. TRA CỨU DANH SÁCH ĐOÀN SINH THEO NĂM SINH / ĐỘ TUỔI / NGÀNH / ĐỘI / XÃ ĐẠO (ví dụ: "danh sách tên các bạn đoàn sinh 2012", "đoàn sinh 2012", "sinh năm 2012", "các bạn 14 tuổi", "danh sách nữ ngành Thiếu", "danh sách đội Tùng"): BẮT BUỘC gọi công cụ \`get_members_list\` (với tham số \`birthYear: 2012\`, \`age: 14\`, \`branch: 'Thiếu'\`, \`group: 'Tùng'\`...). Luôn xuất bảng chi tiết đầy đủ gồm Họ tên, Ngày sinh, Tuổi, Giới tính, Ngành, Đội, Xã đạo, SĐT liên hệ, Tên Cha Mẹ. Nếu người dùng chỉ nói một năm như "đoàn sinh 2012", hãy ưu tiên hiểu là năm sinh (birthYear: 2012).
2. Khi người dùng hỏi về ĐỘ TUỔI, NĂM SINH, CƠ CẤU NHÂN KHẨU (ví dụ: "các bạn độ tuổi từ bao nhiêu đến bao nhiêu", "bao nhiêu tuổi", "sinh năm mấy"): BẮT BUỘC gọi công cụ \`get_member_demographics\` với tham số \`groupBy: 'birthYear'\` để tính toán độ tuổi thực tế từ Database.
3. TUYỆT ĐỐI KHÔNG HỨA HẸN ẢO: Bạn chỉ là Trợ lý tra cứu (Read-Only), KHÔNG CÓ QUYỀN tự động sửa code, sửa database hay tự gửi báo cáo kỹ thuật. Tuyệt đối không nói các câu hứa hẹn ảo như "tôi đã ghi nhận để báo cáo kỹ thuật cập nhật lại". Nếu dữ liệu chưa chính xác, hãy giải thích trung thực về dữ liệu hiện tại trong hệ thống.

Danh sách 36 Công cụ (AI Tools) chuyên sâu bạn sở hữu:
1. 📊 Điều hành & Tổng quan: \`get_executive_overview\`, \`get_branch_performance\`, \`get_yearly_summary_report\`, \`get_system_health_and_data_summary\`
2. 👥 Nhân sự & Quản trị Đoàn sinh: \`get_member_demographics\`, \`search_member_profile\`, \`get_emergency_contact_directory\`, \`get_sibling_family_groups\`, \`get_inactive_and_dropped_members\`, \`get_unassigned_members_and_leaders\`, \`get_comprehensive_member_audit_card\`
3. 📈 Chuyên cần & Điểm danh: \`get_attendance_analytics\`, \`get_attendance_streak_leaderboard\`, \`get_consecutive_absent_alerts\`, \`get_session_detailed_history\`, \`get_attendance_by_day_of_week\`, \`get_attendance_trend\`, \`get_session_attendance_details\`
4. 📚 Học tập & Điểm số: \`get_subject_grades_analytics\`, \`get_grade_distribution_summary\`, \`get_grade_outliers_and_anomalies\`, \`get_scoring_rules_and_weights\`, \`get_top_members\`, \`get_top_performers\`, \`get_risk_members\`, \`get_at_risk_members\`
5. 📖 Kế hoạch sinh hoạt, Giáo án & Phê duyệt: \`get_quarter_programs\`, \`get_lesson_preparation_readiness\`, \`get_documents_and_approvals\`
6. ⛺ Sự kiện, Ngoại khóa & Thăng tiến: \`get_activities_summary\`, \`get_upcoming_events\`, \`get_member_activity_history\`, \`get_promotion_and_new_members\`, \`get_quarterly_birthdays\`
7. 👔 Ban trưởng & Đội nhóm: \`get_leaders_directory\`, \`get_leaders_contribution_stats\`, \`get_group_squad_distribution\`, \`get_church_parish_breakdown\`, \`get_branch_contact_representatives\`, \`get_leader_to_member_ratio\`

Phong cách trả lời:
- Trả lời bằng tiếng Việt tự nhiên, chuẩn mực, đúng trọng tâm câu hỏi.
- Tuyệt đối tuân thủ quy tắc danh xưng (gọi "Trưởng", không gọi "Huynh trưởng", gọi "Gia Đình Hưng ĐạoGia Đình Hưng Đạo Trung Nam", không gọi "Gia Đình Hưng Đạo").
- Định dạng Markdown trực quan: Bảng biểu (\`| Cột 1 | Cột 2 |\`), danh sách (\`-\`), in đậm (\`**số liệu**\`), biểu tượng cảm xúc (emoji).
- Thời gian hiện tại: Quý ${currentQuarter}/${currentYear}.
- Không bịa đặt số liệu. Luôn gọi tool phù hợp để lấy dữ liệu thực tế từ database.
- Luôn kèm theo 1-2 câu hỏi gợi ý liên quan ở cuối câu trả lời.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GENERATE FALLBACK RESPONSE (no API key / local mode)
// ─────────────────────────────────────────────────────────────────────────────
async function generateFallbackResponse(message, userContext) {
  const q = message.toLowerCase();
  const noAccentQ = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  const matchAny = (...keywords) => keywords.some((k) => q.includes(k) || noAccentQ.includes(k));

  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;

  let branch = "all";
  if (matchAny("thieu")) branch = "Thiếu";
  else if (matchAny("dong")) branch = "Đồng";
  else if (matchAny("thanh")) branch = "Thanh";

  try {
    // -2. Chào hỏi, bắt đầu, câu hỏi làm quen (dành cho người mới mở khung chat)
    const isGreeting =
      ["alo", "xin chao", "chao", "chao ban", "chao em", "hi", "hello", "bat dau", "hoi xiu"].some(
        (w) => noAccentQ === w || noAccentQ.startsWith(w + " ") || noAccentQ.endsWith(" " + w) || noAccentQ.includes(" " + w + " ")
      ) ||
      matchAny("giup minh", "huong dan", "tro ly", "cho hoi");

    if (isGreeting && !matchAny("xin nghi", "nghi hoc", "hoc phi", "dong phuc", "may gio", "sdt", "lien he")) {
      let md = `### 👋 Xin chào Trưởng & Quý phụ huynh!\n\n`;
      md += `Em là **Trợ lý Đồng hành của Gia Đình Hưng Đạo Trung Nam**. Trưởng hoặc Quý phụ huynh có thể hỏi em bất kỳ điều gì bằng lời nói tự nhiên hàng ngày:\n\n`;
      md += `* 👨‍👩‍👧 **Dành cho Phụ huynh & Người mới:**\n`;
      md += `  - *"Bé 8 tuổi học lớp nào, ai phụ trách?"*\n`;
      md += `  - *"Chúa Nhật sinh hoạt mấy giờ và mặc đồng phục gì?"*\n`;
      md += `  - *"Học phí thế nào và làm sao để đăng ký tham gia?"*\n`;
      md += `  - *"Muốn xin nghỉ học cho con thì liên hệ ai?"*\n`;
      md += `* 👔 **Dành cho Ban Trưởng:**\n`;
      md += `  - *"Danh sách các em vắng nhiều cần thăm hỏi"*\n`;
      md += `  - *"Ai có sinh nhật trong 30 ngày tới?"*\n`;
      md += `  - *"Danh bạ số điện thoại liên lạc khẩn cấp phụ huynh"*\n`;
      md += `  - *"So sánh tỷ lệ chuyên cần các ngành Quý này"*\n\n`;
      md += `💡 *Trưởng hoặc Quý vị có thể gõ trực tiếp câu hỏi vào ô bên dưới hoặc bấm vào các nút gợi ý có sẵn nhé!*\n`;
      return md;
    }

    // -1.5. Hướng dẫn xin phép nghỉ học / vắng phép
    if (matchAny("xin nghi", "nghi hoc", "bi om", "bi benh", "ban viec", "vang phep", "nghi phep")) {
      let md = `### 📝 Hướng dẫn Xin phép Nghỉ học / Vắng có phép\n\n`;
      md += `Kính gửi Quý phụ huynh và Đoàn sinh,\n\n`;
      md += `Để đảm bảo an toàn và nề nếp sinh hoạt của các em, quy trình xin phép vắng rất đơn giản:\n\n`;
      md += `1. **Thời gian báo phép:** Trước giờ tập hợp ít nhất **2 tiếng** (trước 12h30 trưa Chúa Nhật).\n`;
      md += `2. **Hình thức:** Phụ huynh gọi điện hoặc nhắn tin trực tiếp qua Zalo cho Trưởng phụ trách Ngành của bé.\n`;
      md += `3. **Quyền lợi chuyên cần:** Buổi vắng có phép chỉ tính quy đổi **0.2** (thay vì 1.0 như vắng không phép), giúp bảo lưu điểm thi đua cho các em.\n\n`;
      md += `#### 📞 Danh bạ Trưởng Phụ Trách các Ngành:\n`;
      md += `* 🟢 **Ngành Đồng (6-11 tuổi):** Vườn trưởng Đoàn Thị Hoàng Trâm (Email: \`phuquocvuondong@gmail.com\`)\n`;
      md += `* 🔵 **Ngành Thiếu (12-14 tuổi):** Thiếu Trưởng Nguyễn Đăng Đạo (Email: \`nguyendangdao35@gmail.com\`)\n`;
      md += `* 🔴 **Ngành Thanh (15-18 tuổi):** Thanh Trưởng Nguyễn Anh Nhật Vũ (Email: \`nguyenanhnhatvu@gmail.com\`)\n\n`;
      md += `💡 *Nếu cần tra cứu số điện thoại cụ thể của phụ huynh khác, hãy hỏi: "Danh bạ liên lạc khẩn cấp phụ huynh".*\n`;
      return md;
    }

    // -1.4. Quy định Đồng phục & Trang phục sinh hoạt
    if (matchAny("dong phuc", "trang phuc", "quan ao", "ao trang", "khan quang", "mac gi")) {
      let md = `### 👕 Quy định Đồng phục Sinh hoạt Gia Đình Hưng Đạo Trung Nam\n\n`;
      md += `Để tạo tính kỷ luật và vẻ đẹp trang nghiêm trong phong trào Thiếu Nhi Thánh Thể, các em mặc đồng phục như sau:\n\n`;
      md += `* 👕 **Áo:** Áo sơ mi trắng ngắn tay, có thêu phù hiệu Phong trào TNTT trên ngực áo bên trái.\n`;
      md += `* 👖 **Quần / Váy:** Quần tây màu xanh đen sẫm (hoặc váy xếp ly xanh đen qua gối đối với nữ).\n`;
      md += `* 👟 **Giày / Dép:** Mang giày bata hoặc dép có quai hậu (quai cài) gọn gàng.\n`;
      md += `* 🧣 **Khăn quàng theo cấp Ngành:**\n`;
      md += `  - 🟢 **Ngành Đồng (6-11 tuổi):** Khăn màu xanh lá mạ viền vàng (mầm non, tươi vui, hy vọng).\n`;
      md += `  - 🔵 **Ngành Thiếu (12-14 tuổi):** Khăn màu xanh biển viền vàng (trời cao biển rộng, lý tưởng trong sáng).\n`;
      md += `  - 🟡 **Ngành Thanh (15-18 tuổi):** Khăn màu vàng nghệ viền đỏ (ánh sáng đức tin và tinh thần dấn thân).\n\n`;
      md += `💡 *Các em đoàn sinh mới gia nhập chưa kịp chuẩn bị đồng phục vẫn có thể mặc áo trắng quần sẫm màu bình thường đến sinh hoạt cùng các bạn!*\n`;
      return md;
    }

    // -1.3. Giờ giấc sinh hoạt Chúa Nhật
    if (matchAny("may gio", "gio sinh hoat", "khi nao hoc", "gio giac", "lich sinh hoat") || (matchAny("chua nhat") && matchAny("may gio", "khi nao", "hoc may gio", "gio"))) {
      let md = `### 🕐 Thời gian & Địa điểm Sinh hoạt Hàng Tuần\n\n`;
      md += `* 📅 **Ngày sinh hoạt:** **Chiều Chúa Nhật hàng tuần**.\n`;
      md += `* ⏰ **Khung giờ chuẩn:**\n`;
      md += `  - **14h15 - 14h30:** Tập trung điểm danh, ổn định hàng ngũ các đội.\n`;
      md += `  - **14h30 - 15h00:** Nghi thức chào cờ phong trào, câu chuyện dưới cờ.\n`;
      md += `  - **15h00 - 16h00:** Học giáo lý theo từng cấp Ngành (Đồng, Thiếu, Thanh).\n`;
      md += `  - **16h00 - 16h45:** Sinh hoạt kỹ năng, trò chơi hàng đội, tập nghi thức, ca múa.\n`;
      md += `  - **16h45 - 17h00:** Hạ cờ, dặn dò phụ huynh đón các em.\n`;
      md += `* 📍 **Địa điểm:** Khuôn viên nhà sinh hoạt Giáo họ Trung Nam.\n\n`;
      md += `💡 *Quý phụ huynh có thể đưa đón các em vào lúc 14h15 và 17h00 tại cổng nhà thờ.*\n`;
      return md;
    }

    // -1.2. Cách thức Đăng ký & Học phí
    if (matchAny("dang ky", "gia nhap", "vao hoc", "nhap doan", "xin vao", "hoc phi", "bao nhieu tien", "dong tien")) {
      let md = `### 📝 Hướng dẫn Đăng ký Gia nhập & Học phí\n\n`;
      md += `Gia Đình Hưng Đạo Trung Nam luôn hân hoan chào đón tất cả các em thanh thiếu nhi tham gia sinh hoạt!\n\n`;
      md += `* 💰 **Học phí:** **HOÀN TOÀN MIỄN PHÍ 100%**.\n`;
      md += `* 👶 **Độ tuổi tiếp nhận:** Các em từ **6 tuổi đến 18 tuổi** (từ Lớp 1 đến Lớp 12).\n`;
      md += `* 📋 **Cách thức đăng ký rất đơn giản:**\n`;
      md += `  1. Phụ huynh dẫn bé đến trực tiếp phòng sinh hoạt Giáo họ Trung Nam vào đầu giờ chiều Chúa Nhật (khoảng 14h15).\n`;
      md += `  2. Gặp trực tiếp Ban Trưởng hoặc Trưởng phụ trách Ngành theo độ tuổi của bé để nhận phiếu thông tin đoàn sinh.\n`;
      md += `  3. Bé sẽ được xếp vào Đội nhóm phù hợp ngay trong buổi đầu tiên để làm quen với các bạn.\n\n`;
      md += `💡 *Quý phụ huynh có thể gọi trước cho Trưởng phụ trách ngành để được chuẩn bị chu đáo nhất.*\n`;
      return md;
    }

    // -1.1. Cắm trại & Hoạt động dã ngoại
    if (matchAny("cam trai", "da ngoai", "trai he", "lua trai", "ngoai troi")) {
      let md = `### ⛺ Hoạt động Cắm trại & Dã ngoại Hưng Đạo\n\n`;
      md += `Bên cạnh các buổi sinh hoạt hàng tuần, Gia Đình Hưng Đạo Trung Nam thường xuyên tổ chức các hoạt động ngoại khóa sôi nổi:\n\n`;
      md += `* 🏕️ **Kỳ Trại Truyền thống Hưng Đạo:** Tổ chức hàng năm vào dịp hè hoặc ngày lễ lớn, gồm trò chơi lớn (mật thư, dấu đường), dựng lều trại, thi nấu ăn dã chiến và đêm lửa trại.\n`;
      md += `* 🏃 **Sinh hoạt kỹ năng sống:** Huấn luyện nút dây ứng dụng, la bàn định vị, sơ cấp cứu, kỹ năng sinh tồn và làm việc nhóm.\n`;
      md += `* 🤝 **Công tác bác ái & Môi trường:** Các chuyến đi thăm mái ấm, dọn dẹp vệ sinh khuôn viên giáo họ và hành hương dã ngoại.\n\n`;
      md += `💡 *Có thể hỏi thêm: "Thống kê các hoạt động cắm trại dã ngoại gần đây" để xem số liệu tham gia cụ thể.*\n`;
      return md;
    }

    // -1.05. Danh bạ số điện thoại liên hệ Ban Trưởng
    if (matchAny("sdt", "so dien thoai", "lien he", "gap ai", "truong doan", "ai phu trach")) {
      let md = `### 📞 Danh bạ Liên hệ Đại diện Ban Trưởng\n\n`;
      md += `Kính gửi Quý phụ huynh và các Trưởng, danh bạ đại diện chính thức gồm có:\n\n`;
      md += `| Chức danh | Họ và tên | Ngành phụ trách | Email liên hệ |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      md += `| ⭐ **Trưởng ban hướng dẫn** | Phạm Ngọc Duy | Toàn Gia Đình Hưng Đạo | \`phamtuananh24@gmail.com\` |\n`;
      md += `| 🟢 **Vườn Trưởng** | Đoàn Thị Hoàng Trâm | Ngành Đồng (6-11 tuổi) | \`phuquocvuondong@gmail.com\` |\n`;
      md += `| 🔵 **Thiếu Trưởng** | Nguyễn Đăng Đạo | Ngành Thiếu (12-14 tuổi) | \`nguyendangdao35@gmail.com\` |\n`;
      md += `| 🔴 **Thanh Trưởng** | Nguyễn Anh Nhật Vũ | Ngành Thanh (15-18 tuổi) | \`nguyenanhnhatvu@gmail.com\` |\n\n`;
      md += `💡 *Quý vị có thể liên hệ vào các ngày trong tuần hoặc trực tiếp gặp vào chiều Chúa Nhật tại Giáo họ Trung Nam.*\n`;
      return md;
    }

    // 0.0. Tra cứu danh sách đoàn sinh theo năm sinh / năm tham gia (ví dụ: 2012, sinh năm 2012, các bạn 2012...)
    const yearMatches = message.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatches) {
      const targetYear = parseInt(yearMatches[1], 10);
      const isListQuery =
        q.includes("danh sách") ||
        q.includes("danh sach") ||
        q.includes("đoàn sinh") ||
        q.includes("doan sinh") ||
        q.includes("các bạn") ||
        q.includes("cac ban") ||
        q.includes("mấy đứa") ||
        q.includes("sinh năm") ||
        q.includes("sinh nam") ||
        q.includes("năm sinh") ||
        q.includes("nam sinh") ||
        q.includes("tên") ||
        q.includes("ten") ||
        q.includes("ai");

      if (isListQuery) {
        const where = { active: true };
        if (branch !== "all") where.branch = branch;

        const allActive = await prisma.member.findMany({
          where,
          orderBy: [{ branch: "asc" }, { name: "asc" }],
        });

        // 1. Khớp theo năm sinh (ưu tiên số 1)
        const bornMembers = allActive.filter((m) => m.birthDate && new Date(m.birthDate).getFullYear() === targetYear);
        // 2. Khớp theo năm tham gia (startYear)
        const joinedMembers = allActive.filter((m) => m.startYear === targetYear);

        if (bornMembers.length > 0 || joinedMembers.length > 0) {
          const displayMembers = bornMembers.length > 0 ? bornMembers : joinedMembers;
          const matchType = bornMembers.length > 0 ? `sinh năm ${targetYear}` : `gia nhập năm ${targetYear}`;

          let md = `### 📋 Danh sách Đoàn sinh ${matchType} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch})\n\n`;
          md += `Hệ thống ghi nhận **${displayMembers.length} đoàn sinh** ${matchType}:\n\n`;
          md += `| STT | Mã ĐS | Họ và tên | Ngày sinh (Tuổi) | Giới tính | Ngành | Chi đoàn/Đội | Xã đạo/Xã đạo | SĐT Liên hệ | Phụ huynh |\n`;
          md += `| :---: | :---: | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |\n`;

          displayMembers.forEach((m, idx) => {
            const bDate = m.birthDate ? new Date(m.birthDate) : null;
            const bYear = bDate ? bDate.getFullYear() : null;
            const age = bYear ? `${currentYear - bYear} tuổi` : "—";
            const formattedDate = bDate ? `${String(bDate.getDate()).padStart(2, "0")}/${String(bDate.getMonth() + 1).padStart(2, "0")}/${bYear}` : "*(Chưa cập nhật)*";
            const parents = [m.fatherName && m.fatherName !== "—" ? `Cha: ${m.fatherName}` : "", m.motherName && m.motherName !== "—" ? `Mẹ: ${m.motherName}` : ""].filter(Boolean).join(", ") || "—";

            md += `| ${idx + 1} | **${m.id}** | **${m.name}** | ${formattedDate} (${age}) | ${m.gender || "—"} | ${m.branch || "—"} | ${m.group || "Chưa xếp đội"} | ${m.parish || "—"} | \`${m.contact && m.contact !== "—" ? m.contact : "Chưa có SĐT"}\` | ${parents} |\n`;
          });

          if (bornMembers.length > 0 && joinedMembers.length > 0 && bornMembers.length !== joinedMembers.length) {
            md += `\n💡 *Ghi chú thêm: Có ${joinedMembers.length} đoàn sinh có năm gia nhập (startYear) là ${targetYear}.*\n`;
          }
          return md;
        }
      }
    }

    // -1. Giới thiệu tổng quan tổ chức & học phí (dành cho người mới / phụ huynh)
    if (q.includes("là gì") || q.includes("học phí") || q.includes("câu lạc bộ") || q.includes("dạy cái gì") || q.includes("ở đâu") && (q.includes("trung nam") || q.includes("đây"))) {
      let md = `### 🕊️ Giới thiệu về Gia Đình Hưng Đạo Trung Nam\n\n`;
      md += `**Gia Đình Hưng Đạo Trung Nam** là đơn vị sinh hoạt thuộc phong trào **Thiếu Nhi Thánh Thể** (Giáo họ Trung Nam - Xã đạo Phước Mỹ/Phước Nguyên/Phước Minh).\n\n`;
      md += `* **Mục đích:** Giáo dục đức tin, nhân bản, kỹ năng sống và tinh thần kỷ luật cho các em thanh thiếu nhi.\n`;
      md += `* **Thời gian sinh hoạt:** Chiều Chúa Nhật hàng tuần (từ 14h30 đến 17h00) (tập hợp chào cờ, học giáo lý, sinh hoạt hàng đội, trò chơi kỹ năng).\n`;
      md += `* **Học phí:** **Hoàn toàn MIỄN PHÍ**. Phong trào hoạt động trên tinh thần thiện nguyện của Ban Trưởng và sự bảo trợ của Giáo họ/Giáo xứ.\n`;
      md += `* **Cơ cấu 3 Ngành:**\n`;
      md += `  - 🟢 **Ngành Đồng (6 - 11 tuổi):** Vườn trưởng Đoàn Thị Hoàng Trâm phụ trách.\n`;
      md += `  - 🔵 **Ngành Thiếu (12 - 14 tuổi):** Thiếu Trưởng Nguyễn Đăng Đạo phụ trách.\n`;
      md += `  - 🔴 **Ngành Thanh (15 - 18 tuổi):** Thanh Trưởng Nguyễn Anh Nhật Vũ phụ trách.\n\n`;
      md += `💡 *Quý phụ huynh hoặc Trưởng có thể hỏi thêm: "Danh bạ liên hệ các trưởng", "Danh sách đoàn sinh theo năm sinh", hoặc "Lịch sinh hoạt tuần này".*`;
      return md;
    }

    // -0.5. Tư vấn độ tuổi & lớp sinh hoạt (dành cho phụ huynh hỏi tuổi con)
    const ageMatch = q.match(/\b(\d{1,2})\s*(tuổi|tuoi|t)\b/i) || message.match(/\b(\d{1,2})\s*(tuổi|tuoi|t)\b/i);
    if (ageMatch && (matchAny("vao lop", "hoc lop", "nganh nao", "be", "con", "ban", "tuoi", "sinh hoat"))) {
      const askAge = parseInt(ageMatch[1], 10);
      let targetBranch = "Đồng";
      let branchLeader = "Vườn trưởng Đoàn Thị Hoàng Trâm (phuquocvuondong@gmail.com)";
      if (askAge >= 12 && askAge <= 14) {
        targetBranch = "Thiếu";
        branchLeader = "Thiếu Trưởng Nguyễn Đăng Đạo (nguyendangdao35@gmail.com)";
      } else if (askAge >= 15) {
        targetBranch = "Thanh";
        branchLeader = "Thanh Trưởng Nguyễn Anh Nhật Vũ (nguyenanhnhatvu@gmail.com)";
      }

      const currentYear = new Date().getFullYear();
      const birthYearApprox = currentYear - askAge;

      const peers = await prisma.member.findMany({
        where: {
          active: true,
          birthDate: { not: null },
        },
        select: { id: true, name: true, branch: true, parish: true, birthDate: true },
      });

      const matchedPeers = peers.filter((m) => {
        const y = new Date(m.birthDate).getFullYear();
        return (currentYear - y) === askAge;
      });

      let md = `### 👶 Tư vấn Xếp Ngành theo Độ Tuổi (${askAge} tuổi)\n\n`;
      md += `Dạ, bé **${askAge} tuổi** (sinh khoảng năm **${birthYearApprox}**) sẽ tham gia sinh hoạt tại **Ngành ${targetBranch}**.\n\n`;
      md += `* **Độ tuổi chuẩn:** Ngành ${targetBranch} dành cho các em từ ${targetBranch === "Đồng" ? "6 đến 11" : targetBranch === "Thiếu" ? "12 đến 14" : "15 đến 18"} tuổi.\n`;
      md += `* **Người phụ trách Ngành:** ${branchLeader}.\n`;
      md += `* **Bạn bè cùng ${askAge} tuổi đang sinh hoạt:** Hiện có **${matchedPeers.length} bạn** cùng ${askAge} tuổi trong hệ thống:\n\n`;

      if (matchedPeers.length > 0) {
        md += `| STT | Họ và tên | Ngành | Xã đạo / Khu vực |\n`;
        md += `| :---: | :--- | :---: | :--- |\n`;
        matchedPeers.forEach((p, idx) => {
          md += `| ${idx + 1} | **${p.name}** | Ngành ${p.branch} | ${p.parish || "Chưa cập nhật"} |\n`;
        });
      } else {
        md += `*(Hiện chưa có bạn nào cùng chính xác ${askAge} tuổi, nhưng các bạn chênh lệch 1 tuổi trong Ngành sinh hoạt rất hòa đồng!)*\n`;
      }
      return md;
    }

    // 0. Sinh nhật theo Quý / Tháng
    if (matchAny("sinh nhat", "ngay sinh", "tuoi moi", "sinh thang")) {
      const bData = await dashboardService.getQuarterlyBirthdays({ role: "admin" }, { year: currentYear, quarter: currentQuarter, branch });
      const members = bData?.members || [];
      if (members.length === 0) {
        return `Hiện chưa có thông tin ai có sinh nhật trong Quý ${currentQuarter}/${currentYear} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch}).`;
      }
      let md = `### 🎂 Danh sách Sinh nhật trong Quý ${currentQuarter}/${currentYear} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch})\n\n`;
      md += `Hệ thống ghi nhận **${members.length} thành viên** (gồm Đoàn sinh và Trưởng) đón tuổi mới trong quý này:\n\n`;
      md += `| Ngày sinh | Họ và tên | Vai trò | Ngành | Chi đoàn/Đội | Xã đạo/Xã đạo | Tuổi mới |\n`;
      md += `| :---: | :--- | :--- | :--- | :--- | :--- | :---: |\n`;
      members.forEach((m) => {
        const roleLabel = m.isLeader ? `⭐ **${m.role || "Trưởng"}**` : "Đoàn sinh";
        md += `| **${m.formattedDate}** | **${m.fullName}** | ${roleLabel} | ${m.branch ? "Ngành " + m.branch : "—"} | ${m.group || "—"} | ${m.parish || "—"} | ${m.age ? `${m.age} tuổi` : "—"} |\n`;
      });
      return md;
    }

    // 1. Phân bố Xã đạo / Họ Đạo / Địa bàn / Giới tính
    if (q.includes("xã đạo") || q.includes("Xã đạo") || q.includes("Họ Đạo") || q.includes("nhà thờ") || q.includes("địa bàn") || q.includes("phân bố") || q.includes("giới tính") || q.includes("ở đâu")) {
      const groupBy = (q.includes("Họ Đạo") || q.includes("nhà thờ")) ? "church" : (q.includes("giới tính") || q.includes("nam") || q.includes("nữ")) ? "gender" : "parish";
      const groupTitle = groupBy === "church" ? "Họ Đạo / Nhà thờ" : groupBy === "gender" ? "Giới tính" : "Xã đạo / Xã đạo";

      const where = { active: true };
      if (branch !== "all") where.branch = branch;

      const members = await prisma.member.findMany({
        where,
        select: { parish: true, church: true, gender: true },
      });

      const counts = {};
      for (const m of members) {
        let val = m[groupBy];
        if (!val || val === "-" || !val.trim()) val = "Chưa cập nhật";
        else val = val.trim();
        counts[val] = (counts[val] || 0) + 1;
      }

      const total = members.length;
      const sorted = Object.entries(counts)
        .map(([name, count]) => ({
          name,
          count,
          pct: ((count / (total || 1)) * 100).toFixed(1),
        }))
        .sort((a, b) => b.count - a.count);

      if (sorted.length === 0) {
        return `Hiện chưa có thông tin dữ liệu về ${groupTitle.toLowerCase()} của đoàn sinh (${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch}).`;
      }

      const top1 = sorted[0];
      let md = `### 📍 Thống kê phân bố Đoàn sinh theo ${groupTitle} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch})\n\n`;
      md += `Đoàn sinh tập trung nhiều nhất tại **${top1.name}** với **${top1.count} em** (${top1.pct}% trên tổng số ${total} đoàn sinh).\n\n`;
      md += `| ${groupTitle} | Số lượng | Tỷ lệ |\n`;
      md += `| :--- | :---: | :---: |\n`;
      sorted.forEach((item) => {
        md += `| **${item.name}** | ${item.count} em | ${item.pct}% |\n`;
      });
      md += `\n💡 *Bạn có thể hỏi thêm: "Top điểm cao nhất", "Tình hình chuyên cần", hoặc "Danh sách nguy cơ".*`;
      return md;
    }

    // 2. Tra cứu chi tiết hồ sơ đoàn sinh / phụ huynh / người phụ trách
    const isMemberQuery =
      q.includes("tìm") ||
      q.includes("thông tin") ||
      q.includes("hồ sơ") ||
      q.includes("đoàn sinh") ||
      q.includes("ai là") ||
      q.includes("là ai") ||
      q.includes("ba của") ||
      q.includes("ba cua") ||
      q.includes("mẹ của") ||
      q.includes("me cua") ||
      q.includes("bố của") ||
      q.includes("bo cua") ||
      q.includes("cha của") ||
      q.includes("cha cua") ||
      q.includes("phụ huynh") ||
      q.includes("phu huynh") ||
      q.includes("bạn") ||
      q.includes("ban ");

    if (isMemberQuery) {
      let searchWords = message
        .replace(/(còn|xem|cho tôi biết|cho hoi|cho hỏi|tìm|thông tin|hồ sơ|đoàn sinh|em|bạn|ban|anh|chị|ba của|ba cua|mẹ của|me cua|cha của|cha cua|bố của|bo cua|phụ huynh của|phu huynh cua|phụ huynh|phu huynh|ai là|là ai|la ai)\s*/gi, " ")
        .replace(/[?!.,]/g, "")
        .trim();

      if (searchWords) {
        const where = {
          active: true,
          OR: [
            { name: { contains: searchWords, mode: "insensitive" } },
            { parish: { contains: searchWords, mode: "insensitive" } },
            { group: { contains: searchWords, mode: "insensitive" } },
          ],
        };
        if (branch !== "all") where.branch = branch;

        const members = await prisma.member.findMany({
          where,
          take: 3,
          include: {
            grades: { where: { year: currentYear, quarter: currentQuarter }, include: { category: true } },
            attendances: { take: 5, orderBy: { date: "desc" } },
          },
        });

        if (members.length === 0) {
          return `Chào Trưởng, tôi đã tra cứu trong hệ thống Gia Đình Hưng Đạo Trung Nam nhưng hiện tại **không tìm thấy đoàn sinh nào tên "${searchWords}"** (hoặc thông tin chưa được cập nhật). Trưởng vui lòng kiểm tra lại họ tên hoặc Ngành của em nhé!`;
        }

        let md = `### 🔍 Kết quả Tra cứu Đoàn sinh ("${searchWords}")\n\n`;
        members.forEach((m) => {
          md += `#### 👤 **${m.name}** (Ngành ${m.branch} - Chi đoàn: ${m.group || "—"})\n`;
          md += `- **Ngày sinh:** ${m.birthDate ? new Date(m.birthDate).toLocaleDateString("vi-VN") : "*(Chưa cập nhật)*"} | **Giới tính:** ${m.gender || "—"}\n`;
          md += `- **Xã đạo:** ${m.parish || "*(Chưa cập nhật)*"} | **Họ Đạo:** ${m.church || "*(Chưa cập nhật)*"}\n`;
          md += `- **Cha / Ba:** ${m.fatherName && m.fatherName !== "—" ? `**${m.fatherName}**` : "*(Chưa có thông tin)*"}\n`;
          md += `- **Mẹ:** ${m.motherName && m.motherName !== "—" ? `**${m.motherName}**` : "*(Chưa có thông tin)*"}\n`;
          md += `- **SĐT liên hệ:** ${m.contact && m.contact !== "—" ? `\`${m.contact}\`` : "*(Chưa có thông tin)*"}\n`;
          md += `- **Địa chỉ:** ${m.address || "*(Chưa cập nhật)*"}\n`;
          if (m.grades?.length > 0) {
            md += `- **Điểm các môn (Q${currentQuarter}):** ` + m.grades.map((g) => `${g.category?.name}: **${g.score}**`).join(", ") + `\n`;
          }
          md += `\n---\n`;
        });
        return md;
      }
    }

    // 3. Tra cứu nguy cơ / cảnh báo
    if (matchAny("canh bao", "nguy co", "vang nhieu", "nghi nhieu", "hoc luc yeu", "kem")) {
      const risks = await executiveDashboardService.getExecutiveRiskMembers(userContext, { year: currentYear, quarter: currentQuarter, branch });
      if (!risks || risks.length === 0) {
        return `### 🛡️ Tình hình Đoàn sinh diện Cảnh báo (Quý ${currentQuarter}/${currentYear} - ${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch})\n\nHiện tại **không có đoàn sinh nào** thuộc diện cảnh báo nguy cơ nghiêm trọng trong phạm vi quản lý của bạn. Tỷ lệ chuyên cần và điểm số duy trì ở mức an toàn! 🎉`;
      }
      const topRisks = risks.slice(0, 5);
      let md = `### ⚠️ Danh sách Đoàn sinh cần chú ý (Quý ${currentQuarter}/${currentYear} - ${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch})\n\n`;
      md += `Hệ thống ghi nhận **${risks.length} đoàn sinh** có dấu hiệu vắng học hoặc điểm số giảm sút:\n\n`;
      md += `| Đoàn sinh | Ngành | Điểm TB | Vắng quy đổi | Lý do chính |\n`;
      md += `| :--- | :--- | :---: | :---: | :--- |\n`;
      topRisks.forEach((r) => {
        md += `| **${r.fullName}** | ${r.branch} | ${r.averageGrade ?? "—"} | ${r.attendanceEquivalent}b | ${r.reasons?.join("; ") || "Chuyên cần thấp"} |\n`;
      });
      md += `\n💡 **Gợi ý hành động:** Trưởng nên chủ động liên hệ phụ huynh hoặc trao đổi riêng để động viên các em tham gia sinh hoạt đều đặn hơn.`;
      return md;
    }

    // 4. Tra cứu Top điểm / Thi đua
    if (matchAny("top", "cao nhat", "xuat sac", "dan dau", "thu hang", "diem cao")) {
      const topList = await executiveDashboardService.getExecutiveTopMembers(userContext, { year: currentYear, quarter: currentQuarter, branch, sortBy: "overall", limit: 5 });
      if (!topList || topList.length === 0) {
        return `Chưa có dữ liệu xếp hạng thi đua cho Quý ${currentQuarter}/${currentYear} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch}).`;
      }
      let md = `### 🏆 Top 5 Đoàn sinh xuất sắc nhất (Quý ${currentQuarter}/${currentYear} - ${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch})\n\n`;
      md += `| Hạng | Đoàn sinh | Ngành | Tổng điểm | Chuyên cần | Xếp loại |\n`;
      md += `| :---: | :--- | :--- | :---: | :---: | :--- |\n`;
      topList.forEach((m, idx) => {
        const medals = ["🥇", "🥈", "🥉", "4", "5"];
        md += `| ${medals[idx] || idx + 1} | **${m.name}** | ${m.branch} | **${m.score}** | ${m.attendanceRate}% | \`${m.rank}\` |\n`;
      });
      md += `\n🌟 Xin chúc mừng các em đã có thành tích sinh hoạt và học tập xuất sắc!`;
      return md;
    }

    // 5. Tra cứu Xu hướng Chuyên cần & Điểm danh các buổi gần đây
    if (matchAny("chuyen can", "diem danh", "vang", "xu huong", "buoi sinh hoat")) {
      const trend = await executiveDashboardService.getExecutiveAttendanceTrend(userContext, { year: currentYear, quarter: currentQuarter, branch });
      if (trend?.history && trend.history.length > 0) {
        let md = `### 📈 Xu hướng Chuyên cần các buổi sinh hoạt gần nhất (${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch})\n\n`;
        md += `Tỷ lệ chuyên cần trung bình đạt **${trend.averageRate || 0}%**:\n\n`;
        md += `| Buổi sinh hoạt | Tỷ lệ hiện diện | Số vắng |\n`;
        md += `| :--- | :---: | :---: |\n`;
        trend.history.slice(-6).forEach((h) => {
          md += `| ${h.sessionName || h.date} | **${h.rate}%** | ${h.absentCount || 0} em |\n`;
        });
        return md;
      }
    }

    // 6. Phân tích Điểm số Môn học
    if (matchAny("mon hoc", "he so", "diem thi", "giao ly", "kinh thanh")) {
      const categories = await prisma.gradeCategory.findMany({ where: { active: true } });
      let md = `### 📚 Cấu hình Môn học & Hệ số tính điểm\n\n`;
      md += `| Môn học | Hệ số (Trọng số) |\n`;
      md += `| :--- | :---: |\n`;
      categories.forEach((c) => {
        md += `| **${c.name}** | ${c.weight} |\n`;
      });
      return md;
    }

    // 7. Danh bạ trưởng
    if (matchAny("truong", "bqt", "ban quan tri", "danh ba", "ai phu trach")) {
      const users = await prisma.user.findMany({ where: { active: true }, select: { name: true, role: true, branch: true, email: true } });
      let md = `### 👥 Danh bạ Ban Quản Trị & trưởng\n\n`;
      md += `| Họ tên | Vai trò | Ngành phụ trách | Email |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      users.forEach((u) => {
        md += `| **${u.name}** | ${u.role === "admin" ? "BQT (Admin)" : "trưởng"} | ${u.branch ? "Ngành " + u.branch : "Toàn Gia Đình Hưng Đạo Trung Nam"} | \`${u.email}\` |\n`;
      });
      return md;
    }

    // 8. Tóm tắt / Tổng quan Quý
    if (matchAny("tong quan", "tom tat", "tinh hinh", "bao cao", "quy nay", "thong ke", "bao nhieu")) {
      const overview = await executiveDashboardService.getExecutiveOverview(userContext, { year: currentYear, quarter: currentQuarter, branch });
      return `### 📊 Báo cáo Tổng quan Quý ${currentQuarter}/${currentYear} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo Trung Nam" : "Ngành " + branch})

- **Tổng số Đoàn sinh:** **${overview?.totalMembers?.value || 0}** em (${overview?.totalMembers?.diff >= 0 ? "+" : ""}${overview?.totalMembers?.diff || 0} so với quý trước)
- **Tỷ lệ Chuyên cần trung bình:** **${overview?.attendanceRate?.value || 0}%** (${overview?.attendanceRate?.diff >= 0 ? "+" : ""}${overview?.attendanceRate?.diff || 0}%)
- **Điểm Đánh giá trung bình:** **${(overview?.averageScore?.value || 0).toFixed(1)} / 10** (${overview?.averageScore?.diff >= 0 ? "+" : ""}${overview?.averageScore?.diff || 0})
- **Đoàn sinh cần lưu ý (Cảnh báo):** **${overview?.riskMembers?.value || 0}** em

---
💡 *Bạn có thể hỏi tôi chi tiết hơn như: "Top 5 em điểm cao nhất", "Ai đang vắng nhiều?", "Đoàn sinh ở xã đạo nào nhiều nhất?", "Tìm hồ sơ em Vy", hoặc "So sánh chuyên cần các ngành".*`;
    }

    // 9. Trường hợp không nhận diện được ý định rõ ràng: Trả về hướng dẫn thân thiện và gợi ý cụ thể
    return `### 👋 Dạ, Trợ lý Đồng hành Trung Nam xin chào Trưởng & Quý phụ huynh!

Em có thể giúp tra cứu nhanh mọi thông tin sinh hoạt bằng lời nói thông thường hàng ngày:

* 👨‍👩‍👧 **Dành cho Phụ huynh & Người mới:**
  - *"Bé 8 tuổi học lớp nào, ai phụ trách?"*
  - *"Chúa Nhật sinh hoạt mấy giờ và mặc đồng phục gì?"*
  - *"Học phí thế nào và làm sao để đăng ký?"*
  - *"Xin phép nghỉ học cho con"*
  - *"Số điện thoại Trưởng phụ trách các ngành"*
* 👔 **Dành cho Ban Trưởng:**
  - *"Danh sách các em vắng nhiều cần thăm hỏi"*
  - *"Ai có sinh nhật trong 30 ngày tới?"*
  - *"Tóm tắt tình hình các Ngành Quý này"*
  - *"Danh bạ số điện thoại khẩn cấp phụ huynh"*

💡 *Quý vị chỉ cần bấm vào các câu hỏi gợi ý có sẵn hoặc gõ câu hỏi bất kỳ vào ô chat bên dưới nhé!*`;
  } catch (err) {
    console.error("Error in generateFallbackResponse:", err);
    return `Dạ, Trợ lý Đồng hành Trung Nam xin chào! Quý vị có thể hỏi về giờ sinh hoạt, đồng phục, đăng ký đoàn sinh mới, tình hình chuyên cần hoặc danh bạ các Trưởng phụ trách nhé.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. CALL GEMINI API WITH AUTOMATIC MODEL FALLBACK
// ─────────────────────────────────────────────────────────────────────────────
async function callGeminiApi(payload) {
  let lastError = null;

  for (const modelName of GEMINI_MODELS_TO_TRY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    try {
      const res = await axios.post(url, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 65000,
      });
      return { response: res, modelUsed: modelName };
    } catch (err) {
      lastError = err;
      const status = err?.response?.status;
      const errMsg = err?.response?.data?.error?.message || err.message;
      console.warn(`⚠️ Model ${modelName} failed (${status}): ${errMsg}. Trying next model...`);
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. FORMAT TOOL RESULT TO MARKDOWN HELPER (Robust Fallback)
// ─────────────────────────────────────────────────────────────────────────────
function formatToolResultToMarkdown(toolName, result) {
  if (!result || !result.success || !result.data) {
    return result?.error ? `⚠️ Lỗi tra cứu: ${result.error}` : "🔍 Đã tra cứu dữ liệu nhưng không tìm thấy thông tin phù hợp trong hệ thống.";
  }

  const d = result.data;

  switch (toolName) {
    case "get_consecutive_absent_alerts": {
      const alerts = d.alertMembers || d.alerts || [];
      const count = d.count || alerts.length;
      if (count === 0) {
        return "### 🛡️ Cảnh báo Vắng Chuyên cần\n\nHệ thống không ghi nhận đoàn sinh nào vắng liên tiếp quá ngưỡng quy định gần đây. Tình hình chuyên cần ổn định!";
      }

      let md = `### ⚠️ Danh sách Đoàn sinh Vắng liên tiếp (${count} em)\n\n`;
      md += `Dưới đây là các em có nguy cơ bỏ sinh hoạt hoặc vắng nhiều buổi gần đây nhất cần liên hệ gia đình:\n\n`;
      md += `| STT | Mã ĐS | Họ và tên | Ngành | Chi đoàn/Đội | Xã đạo | Số buổi vắng | SĐT Ba Mẹ |\n`;
      md += `| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :--- |\n`;
      alerts.forEach((a, idx) => {
        const m = a.member || a;
        md += `| ${idx + 1} | **${m.id || "—"}** | **${m.name}** | ${m.branch || "—"} | ${m.group || "Chưa xếp"} | ${m.parish || "—"} | **${a.consecutiveAbsents || a.absentCount || 2} buổi** | \`${m.contact || "Chưa có SĐT"}\` |\n`;
      });
      return md;
    }

    case "get_members_list": {
      const members = d.members || [];
      const f = d.filters || {};
      const total = d.totalFound || members.length;

      if (total === 0) {
        return d.note || "🔍 Không tìm thấy đoàn sinh nào thỏa mãn điều kiện tra cứu.";
      }

      let title = "### 📋 Danh sách Đoàn sinh";
      if (f.birthYear) title += ` sinh năm ${f.birthYear}`;
      if (f.startYear) title += ` gia nhập năm ${f.startYear}`;
      if (f.branch && f.branch !== "all") title += ` (Ngành ${f.branch})`;
      if (f.group) title += ` - Chi đoàn/Đội ${f.group}`;
      if (f.parish) title += ` - Xã đạo ${f.parish}`;
      if (f.gender) title += ` - Giới tính ${f.gender}`;

      let md = `${title}\n\n`;
      md += `Hệ thống ghi nhận **${total} đoàn sinh** phù hợp với yêu cầu:\n\n`;
      md += `| STT | Mã ĐS | Họ và tên | Ngày sinh (Tuổi) | Giới tính | Ngành | Chi đoàn/Đội | Xã đạo/Xã đạo | SĐT Liên hệ | Phụ huynh |\n`;
      md += `| :---: | :---: | :--- | :---: | :---: | :---: | :--- | :--- | :--- | :--- |\n`;

      members.forEach((m) => {
        const parents = [m.fatherName && m.fatherName !== "—" ? `Cha: ${m.fatherName}` : "", m.motherName && m.motherName !== "—" ? `Mẹ: ${m.motherName}` : ""].filter(Boolean).join(", ") || "—";
        md += `| ${m.stt} | **${m.id}** | **${m.name}** | ${m.birthDate} (${m.age}) | ${m.gender} | ${m.branch} | ${m.group} | ${m.parish} | \`${m.contact}\` | ${parents} |\n`;
      });

      if (total > members.length) {
        md += `\n*(Đang hiển thị ${members.length}/${total} đoàn sinh. Trưởng có thể lọc chi tiết hơn theo ngành hoặc đội nếu cần)*\n`;
      }
      return md;
    }

    case "search_member_profile": {
      const members = d.members || [];
      const leaders = d.leaders || [];

      if (d.isLeader && leaders.length > 0) {
        let md = `### 👤 Thông tin Trưởng / Ban Quản Trị\n\n`;
        leaders.forEach((u) => {
          md += `#### ⭐ **${u.name}** (${u.role || "Trưởng"})\n`;
          md += `- **Phụ trách:** ${u.branch || "Gia Đình Hưng Đạo Trung Nam"}\n`;
          md += `- **Email:** \`${u.email || "Chưa có"}\` | **Thâm niên:** từ năm ${u.startYear || "—"}\n`;
        });
        return md;
      }

      if (members.length === 0) {
        return d.note || `🔍 **Không tìm thấy thông tin đoàn sinh nào** phù hợp với từ khóa tra cứu trong hệ thống Gia Đình Hưng Đạo Trung Nam.`;
      }

      let md = `### 👤 Kết quả Tra cứu Hồ sơ Đoàn sinh\n\n`;
      members.forEach((m) => {
        md += `#### 📋 **${m.name}** (Ngành ${m.branch || "—"} - Chi đoàn/Đội: ${m.group || "—"})\n`;
        md += `- **Ngày sinh:** ${m.birthDate && m.birthDate !== "—" ? m.birthDate : "*(Chưa cập nhật)*"} | **Giới tính:** ${m.gender || "—"}\n`;
        md += `- **Họ Đạo:** ${m.church && m.church !== "—" ? m.church : "*(Chưa cập nhật)*"} | **Xã đạo:** ${m.parish && m.parish !== "—" ? m.parish : "*(Chưa cập nhật)*"}\n`;
        md += `- **Cha / Ba:** ${m.fatherName && m.fatherName !== "—" ? `**${m.fatherName}**` : "*(Chưa có thông tin)*"}\n`;
        md += `- **Mẹ:** ${m.motherName && m.motherName !== "—" ? `**${m.motherName}**` : "*(Chưa có thông tin)*"}\n`;
        md += `- **SĐT liên hệ:** ${m.contact && m.contact !== "—" ? `\`${m.contact}\`` : "*(Chưa có thông tin)*"}\n`;
        md += `- **Địa chỉ:** ${m.address && m.address !== "—" ? m.address : "*(Chưa cập nhật)*"}\n`;
        if (m.averageScore && m.averageScore !== "Chưa có") {
          md += `- **Điểm trung bình:** **${m.averageScore}/10**\n`;
        }
        if (m.recentAttendanceRate && m.recentAttendanceRate !== "Chưa có") {
          md += `- **Chuyên cần gần đây:** **${m.recentAttendanceRate}**\n`;
        }
        md += `\n---\n`;
      });
      return md;
    }

    case "get_documents_and_approvals": {
      const qProgs = d.quarterPrograms || d.allQuarterPrograms || [];
      const docs = d.documents || [];
      let md = `### 📄 Tình trạng Phê duyệt Chương trình & Tài liệu\n\n`;
      if (qProgs.length > 0) {
        md += `#### 📋 Danh sách Chương trình sinh hoạt Quý:\n`;
        md += `| Tên chương trình | Ngành | Trạng thái | Số bài học | Ngày gửi |\n`;
        md += `| :--- | :--- | :---: | :---: | :---: |\n`;
        qProgs.forEach((p) => {
          const stBadge = p.status === "APPROVED" ? "✅ Đã duyệt" : p.status === "PENDING" ? "⏳ Chờ duyệt" : p.status === "NEED_REVISION" ? "⚠️ Cần sửa" : "📝 Bản nháp";
          md += `| **${p.title}** | ${p.branch} | ${stBadge} | ${p.lessonCount || 0} bài | ${p.date} |\n`;
        });
        md += `\n`;
      }
      if (docs.length > 0) {
        md += `#### 📑 Danh sách Tài liệu / Tờ trình:\n`;
        md += `| Tiêu đề | Trạng thái | Phiên bản | Người tạo | Ngày |\n`;
        md += `| :--- | :---: | :---: | :--- | :---: |\n`;
        docs.forEach((doc) => {
          const stBadge = doc.status === "APPROVED" ? "✅ Đã duyệt" : doc.status === "PENDING" ? "⏳ Chờ duyệt" : doc.status === "NEED_REVISION" ? "⚠️ Cần sửa" : "📝 Bản nháp";
          md += `| **${doc.title}** | ${stBadge} | v${doc.version} | ${doc.createdBy} | ${doc.date} |\n`;
        });
      }
      if (qProgs.length === 0 && docs.length === 0) {
        md += `Hiện không có chương trình hay tài liệu nào phù hợp với điều kiện tìm kiếm.`;
      }
      return md;
    }

    case "get_quarterly_birthdays": {
      const bdays = d.birthdays || d.members || [];
      if (bdays.length === 0) return `Hiện chưa ghi nhận sinh nhật nào trong thời gian này (${d.branch}).`;
      let md = `### 🎂 Danh sách Sinh nhật (${d.branch})\n\n`;
      md += `| Ngày sinh | Họ và tên | Vai trò | Ngành | Chi đoàn/Đội | Xã đạo/Xã đạo | Tuổi mới |\n`;
      md += `| :---: | :--- | :--- | :--- | :--- | :--- | :---: |\n`;
      bdays.forEach((b) => {
        const name = b.fullName || b.name;
        const formattedDate = b.formattedDate || b.birthDate;
        const roleLabel = b.isLeader ? `⭐ **${b.role || "Trưởng"}**` : "Đoàn sinh";
        md += `| **${formattedDate}** | **${name}** | ${roleLabel} | ${b.branch ? "Ngành " + b.branch : "—"} | ${b.group || "—"} | ${b.parish || "—"} | ${b.age ? `${b.age} tuổi` : "—"} |\n`;
      });
      return md;
    }

    case "get_executive_overview": {
      return `### 📊 Báo cáo Tổng quan Quý (${d.branch || "Gia Đình Hưng Đạo Trung Nam"})\n\n` +
        `- **Tổng số Đoàn sinh:** **${d.totalMembers?.value || 0}** em\n` +
        `- **Tỷ lệ Chuyên cần:** **${d.attendanceRate?.value || 0}%**\n` +
        `- **Điểm Đánh giá TB:** **${d.averageScore?.value || 0} / 10**\n` +
        `- **Đoàn sinh cần lưu ý (Cảnh báo):** **${d.riskMembers?.value || 0}** em\n`;
    }

    case "get_top_members":
    case "get_top_performers": {
      const list = d.topMembers || d.members || d.list || [];
      if (list.length === 0) return `Hiện chưa có dữ liệu xếp hạng thi đua cho nhóm đối tượng này.`;
      let md = `### 🏆 Bảng Vàng Thi Đua & Thành Tích\n\n`;
      md += `| Xếp hạng | Đoàn sinh | Ngành | Chi đoàn/Đội | Điểm TB | Chuyên cần |\n`;
      md += `| :---: | :--- | :--- | :--- | :---: | :---: |\n`;
      list.forEach((m, idx) => {
        md += `| **#${idx + 1}** | **${m.fullName || m.name}** | ${m.branch || "—"} | ${m.group || "—"} | **${m.score || m.averageGrade || "—"}** | ${m.attendanceRate || "—"} |\n`;
      });
      return md;
    }

    case "get_risk_members":
    case "get_at_risk_members": {
      const list = d.riskMembers || d.members || d.list || [];
      if (list.length === 0) return `Hiện tại không có đoàn sinh nào thuộc diện cảnh báo nguy cơ. Tỷ lệ chuyên cần và học tập duy trì rất tốt! 🎉`;
      let md = `### ⚠️ Danh sách Đoàn sinh thuộc Diện Cảnh báo\n\n`;
      md += `| Đoàn sinh | Ngành | Điểm TB | Vắng quy đổi | Lý do cảnh báo |\n`;
      md += `| :--- | :--- | :---: | :---: | :--- |\n`;
      list.forEach((m) => {
        md += `| **${m.fullName || m.name}** | ${m.branch || "—"} | ${m.averageGrade || m.score || "—"} | ${m.attendanceEquivalent || m.absentCount || 0}b | ${m.reasons?.join("; ") || m.reason || "Chuyên cần thấp"} |\n`;
      });
      return md;
    }

    case "get_member_demographics": {
      const ranking = d.ranking || [];
      if (ranking.length === 0) return `Chưa có dữ liệu thống kê cơ cấu đoàn sinh theo tiêu chí này.`;
      let md = `### 📍 Thống kê Phân bố Đoàn sinh (${d.branch || "Toàn đoàn"})\n\n`;
      md += `| Phân loại | Số lượng | Tỷ lệ |\n`;
      md += `| :--- | :---: | :---: |\n`;
      ranking.forEach((r) => {
        md += `| **${r.name}** | ${r.count} em | ${r.percentage || r.pct || ""}% |\n`;
      });
      return md;
    }

    case "get_lesson_preparation_readiness": {
      const lessons = d.lessons || [];
      let md = `### 📖 Mức độ Sẵn sàng Giáo án & Bài học (Quý ${d.quarter}/${d.year} - ${d.branch})\n\n`;
      md += `- **Tổng số bài học:** **${d.totalLessons} bài** (Trạng thái chương trình: **${d.programStatus || "Đang thực hiện"}**)\n`;
      md += `- **Tỷ lệ sẵn sàng:** **${d.readinessRate}**\n`;
      md += `- **Đã phân công Trưởng phụ trách:** **${d.assignedLeaderCount}/${d.totalLessons} bài**\n`;
      md += `- **Đã có file/tài liệu đính kèm:** **${d.withFilesCount}/${d.totalLessons} bài**\n\n`;

      if (lessons.length > 0) {
        md += `#### 📋 Danh sách chi tiết các bài học:\n`;
        md += `| Ngày | Tên bài học | Chủ đề / Môn | Địa điểm | Trưởng phụ trách | Tài liệu đính kèm | Trạng thái |\n`;
        md += `| :---: | :--- | :--- | :--- | :--- | :--- | :---: |\n`;
        lessons.forEach((l) => {
          md += `| ${l.date} | **${l.lessonText}** | ${l.category} | ${l.location} | ${l.leaders} | ${l.files} | ${l.prepared} |\n`;
        });
      } else {
        md += `*Hiện chưa có bài học nào được lên kế hoạch cho thời gian này.*\n`;
      }
      return md;
    }

    case "get_quarter_programs": {
      let md = `### 📖 Chương trình Sinh hoạt Quý (Quý ${d.quarter}/${d.year} - ${d.branch})\n\n`;
      md += `- **Trạng thái kế hoạch:** **${d.curriculumStatus || "Đang thực hiện"}**\n`;
      md += `- **Tổng số buổi sinh hoạt:** **${d.totalWeeklySessions || 0} buổi** | **Hoạt động ngoại khóa:** **${d.totalActivities || 0} sự kiện**\n\n`;

      if (d.lessonSchedule && d.lessonSchedule.length > 0) {
        md += `#### 📋 Danh sách Bài khóa / Giáo án:\n`;
        md += `| Ngày | Tên bài học | Thời lượng | Tình trạng chuẩn bị |\n`;
        md += `| :---: | :--- | :---: | :---: |\n`;
        d.lessonSchedule.forEach((l) => {
          md += `| ${l.date} | **${l.lessonText}** | ${l.duration} phút | ${l.prepared} |\n`;
        });
        md += `\n`;
      }

      if (d.weeklySessions && d.weeklySessions.length > 0) {
        md += `#### 📅 Lịch các Buổi Sinh hoạt Hàng Tuần:\n`;
        md += `| Ngày | Ngành | Sĩ số dự kiến | Hiện diện | Vắng | Tỷ lệ |\n`;
        md += `| :---: | :--- | :---: | :---: | :---: | :---: |\n`;
        d.weeklySessions.slice(0, 15).forEach((s) => {
          md += `| ${s.date} | ${s.branch} | ${s.totalExpected} em | **${s.presentCount}** | ${s.absentCount} | **${s.attendanceRate}** |\n`;
        });
        md += `\n`;
      }

      if (d.activities && d.activities.length > 0) {
        md += `#### ⛺ Hoạt động Phong trào trong Quý:\n`;
        md += `| Ngày | Tên hoạt động | Người tổ chức | Số em tham gia |\n`;
        md += `| :---: | :--- | :--- | :---: |\n`;
        d.activities.forEach((a) => {
          md += `| ${a.date} | **${a.name}** | ${a.organizer} | **${a.participants} em** |\n`;
        });
      }
      return md;
    }

    case "get_organization_structure": {
      let md = `### 🕊️ Cơ cấu Tổ chức ${d.organizationName || "Gia Đình Hưng Đạo Trung Nam"}\n\n`;
      md += `- **Tổ chức trực thuộc:** ${d.movement} (${d.headquarters})\n`;
      md += `- **Bốn tôn chỉ:** ${(d.mottos || []).join(" — ")}\n`;
      md += `- **Tổng sĩ số active:** **${d.totalActiveMembers} đoàn sinh** | **${d.totalLeaders} Trưởng**\n\n`;

      md += `#### 🟢 Cơ cấu 3 Cấp Ngành Hoạt Động:\n\n`;
      md += `| Ngành | Độ tuổi (Cấp lớp) | Khẩu hiệu | Màu khăn quàng | Sĩ số thực tế | Trưởng phụ trách | Bổn mạng |\n`;
      md += `| :--- | :--- | :---: | :--- | :---: | :--- | :--- |\n`;
      (d.branchStats || []).forEach((b) => {
        md += `| **${b.name}** | ${b.ageRange} | **${b.motto}** | ${b.scarfColor} | **${b.count} em** | ${b.leader} | ${b.patron} |\n`;
      });

      if (d.leadersList && d.leadersList.length > 0) {
        md += `\n#### ⭐ Ban Trưởng & Ban Quản Trị:\n\n`;
        md += `| STT | Họ và tên | Vai trò / Chức vụ | Ngành phụ trách | Email liên hệ |\n`;
        md += `| :---: | :--- | :--- | :--- | :--- |\n`;
        d.leadersList.forEach((l, idx) => {
          md += `| ${idx + 1} | **${l.name}** | ${l.role || "Trưởng"} | ${l.branch ? "Ngành " + l.branch : "Ban Quản Trị"} | \`${l.email || "—"}\` |\n`;
        });
      }
      return md;
    }

    case "get_attendance_analytics": {
      let md = `### 📈 Báo cáo Chuyên cần Chi tiết (Quý ${d.quarter}/${d.year} - ${d.branch === "all" ? "Toàn Gia Đình Hưng Đạo" : "Ngành " + d.branch})\n\n`;
      md += `- **Tỷ lệ chuyên cần trung bình:** **${d.attendanceRate}** (Điểm TB: **${d.averageScore}/10**)\n`;
      md += `- **Tổng số buổi sinh hoạt tổ chức:** **${d.totalSessions} buổi**\n`;
      md += `- **Sĩ số active:** **${d.totalActiveMembers} em** (Tổng lượt tham gia tối đa: ${d.totalPossibleAttendances} lượt)\n`;
      md += `- **Lượt hiện diện thực tế (ước tính):** **${d.estimatedPresent} lượt**\n`;
      md += `- **Vắng mặt:** Vắng không phép: **${d.absentCount} ca** | Vắng có phép: **${d.excusedCount} ca** | Đi trễ: **${d.lateCount} ca**\n\n`;
      md += `💡 *Công thức quy chuẩn: ${d.formula}*\n`;
      return md;
    }

    case "get_church_parish_breakdown": {
      let md = `### 📍 Thống kê Địa bàn Đoàn sinh (${d.branch === "all" ? "Toàn Gia Đình Hưng Đạo" : "Ngành " + d.branch})\n\n`;
      md += `Tổng số: **${d.totalMembers} đoàn sinh** đang sinh hoạt active.\n\n`;

      md += `#### 🏘️ Phân bố theo Giáo họ / Xã đạo:\n\n`;
      md += `| Giáo họ / Xã đạo | Số lượng ĐS | Tỷ lệ % |\n`;
      md += `| :--- | :---: | :---: |\n`;
      (d.parishRanking || []).forEach((p) => {
        md += `| **${p.name}** | ${p.count} em | ${p.percentage} |\n`;
      });

      md += `\n#### ⛪ Phân bố theo Giáo xứ / Họ Đạo:\n\n`;
      md += `| Giáo xứ / Họ Đạo | Số lượng ĐS | Tỷ lệ % |\n`;
      md += `| :--- | :---: | :---: |\n`;
      (d.churchRanking || []).forEach((c) => {
        md += `| **${c.name}** | ${c.count} em | ${c.percentage} |\n`;
      });
      return md;
    }

    case "get_faqs_and_guidelines": {
      let md = `### ❓ Hỏi đáp & Quy chế Sinh hoạt Gia Đình Hưng Đạo Trung Nam\n\n`;
      (d.faqs || []).forEach((f, idx) => {
        md += `#### ${idx + 1}. ${f.question}\n`;
        md += `${f.answer}\n\n`;
      });
      return md;
    }

    case "get_branch_curriculum_overview": {
      let md = `### 📚 Lộ trình Giáo lý & Mục tiêu Sư phạm 3 Ngành\n\n`;
      (d.curriculum || []).forEach((c) => {
        md += `#### 🔰 ${c.title} (${c.age})\n`;
        md += `- **Khẩu hiệu:** **"${c.motto}"** | **Khăn quàng:** ${c.scarf}\n`;
        md += `- **Trưởng phụ trách:** ${c.leader} | **Bổn mạng:** ${c.patron}\n`;
        md += `- **Trọng tâm sư phạm:** ${c.pedagogyFocus}\n`;
        md += `- **Các môn học & Kỹ năng chính:**\n`;
        (c.coreSubjects || []).forEach((s) => {
          md += `  * ${s}\n`;
        });
        md += `\n`;
      });
      return md;
    }

    case "get_liturgical_calendar_and_feasts": {
      let md = `### 🕯️ Lịch Phụng vụ & Lễ Bổn mạng (${d.organization})\n\n`;
      md += `| Đối tượng / Ngành | Đại lễ Bổn mạng | Ngày mừng lễ | Ý nghĩa & Tinh thần |\n`;
      md += `| :--- | :--- | :---: | :--- |\n`;
      (d.feasts || []).forEach((f) => {
        md += `| **${f.scope}** | **${f.title}** | ${f.date} | ${f.meaning} |\n`;
      });
      return md;
    }

    case "get_camp_participants_and_activities": {
      let md = `### ⛺ Hoạt động Cắm trại & Dã ngoại (${d.year} - ${d.branch === "all" ? "Toàn Gia Đình Hưng Đạo" : "Ngành " + d.branch})\n\n`;
      md += `- **Tổng số sự kiện:** **${d.totalActivities} sự kiện** | **Sĩ số active:** ${d.totalActiveMembers} em\n\n`;

      (d.activities || []).forEach((act) => {
        md += `#### 🏕️ **${act.name}** (Ngày ${act.date} - Quý ${act.quarter}/${act.year})\n`;
        md += `- **Mô tả:** ${act.description}\n`;
        md += `- **Số em tham gia:** **${act.participantCount} em** (Tỷ lệ: **${act.participationRate}**)\n`;
        md += `- **Theo ngành:** Đồng: ${act.branchBreakdown?.Đồng || 0} em | Thiếu: ${act.branchBreakdown?.Thiếu || 0} em | Thanh: ${act.branchBreakdown?.Thanh || 0} em\n\n`;

        if (act.participantsList && act.participantsList.length > 0) {
          md += `| STT | Mã ĐS | Họ và tên | Ngành | Chi đoàn/Đội |\n`;
          md += `| :---: | :---: | :--- | :---: | :--- |\n`;
          act.participantsList.forEach((p) => {
            md += `| ${p.stt} | **${p.id}** | **${p.name}** | ${p.branch} | ${p.group} |\n`;
          });
          md += `\n`;
        }
      });
      return md;
    }

    case "get_upcoming_birthdays_next_30_days": {
      let md = `### 🎂 Sinh nhật Sắp tới trong 30 Ngày (${d.branch === "all" ? "Toàn đoàn" : "Ngành " + d.branch})\n\n`;
      if (!d.birthdays || d.birthdays.length === 0) {
        return md + "Hiện không có thành viên nào có ngày sinh nhật trong 30 ngày tới.";
      }
      md += `Ghi nhận **${d.totalFound} thành viên** chuẩn bị đón tuổi mới:\n\n`;
      md += `| Họ và tên | Vai trò | Ngành | Đội | Ngày sinh | Đón tuổi mới | Còn lại | SĐT liên hệ |\n`;
      md += `| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |\n`;
      d.birthdays.forEach((b) => {
        const days = b.daysLeft === 0 ? "🎉 **HÔM NAY**" : `**${b.daysLeft} ngày nữa**`;
        const role = b.isLeader ? `⭐ **${b.role}**` : "Đoàn sinh";
        md += `| **${b.name}** | ${role} | ${b.branch} | ${b.group} | ${b.birthdayThisYear} | **${b.ageTurning} tuổi** | ${days} | \`${b.contact}\` |\n`;
      });
      return md;
    }

    case "get_attendance_comparison_by_quarter": {
      let md = `### 📊 So sánh Tỷ lệ Chuyên cần 4 Quý (Năm ${d.year} - ${d.branch === "all" ? "Toàn Gia Đình Hưng Đạo" : "Ngành " + d.branch})\n\n`;
      md += `| Quý | Số buổi tổ chức | Sĩ số active | Vắng không phép | Vắng có phép | Trễ | Tỷ lệ chuyên cần |\n`;
      md += `| :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
      (d.quarters || []).forEach((q) => {
        md += `| **${q.quarter}** | ${q.totalSessions} buổi | ${q.totalActiveMembers} em | ${q.absentCount} | ${q.excusedCount} | ${q.lateCount} | **${q.attendanceRate}** |\n`;
      });
      return md;
    }

    case "get_member_health_and_notes": {
      let md = `### 📋 Ghi chú Sư phạm & Sức khỏe Đoàn sinh (${d.branch === "all" ? "Toàn Gia Đình Hưng Đạo" : "Ngành " + d.branch})\n\n`;
      if (!d.members || d.members.length === 0) {
        return md + "Không tìm thấy ghi chú đặc biệt nào phù hợp với yêu cầu tra cứu.";
      }
      md += `Tìm thấy **${d.totalFound} đoàn sinh** có ghi chú hoặc thông tin cần lưu ý:\n\n`;
      d.members.forEach((m) => {
        md += `#### 👤 **${m.name}** (Ngành ${m.branch} - Đội ${m.group})\n`;
        md += `- **SĐT liên hệ:** \`${m.contact}\` | **Phụ huynh:** Cha: ${m.fatherName} - Mẹ: ${m.motherName}\n`;
        if (m.notes && m.notes.length > 0) {
          m.notes.forEach((n) => {
            const dateStr = n.date ? " (ngày " + n.date + ")" : "";
            md += `- 📝 **${n.type}${dateStr}:** ${n.content}\n`;
          });
        }
        md += `\n`;
      });
      return md;
    }

    case "get_branch_performance": {
      let md = `### 🏆 So sánh Hiệu suất & Thi đua 3 Ngành\n\n`;
      if (Array.isArray(d)) {
        md += `| Ngành | Sĩ số | Điểm thi đua TB | Chuyên cần TB | Hoạt động phong trào | Xếp hạng |\n`;
        md += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
        d.forEach((b) => {
          md += `| **Ngành ${b.branch || b.name}** | ${b.totalMembers || b.memberCount || "—"} | **${b.averageScore || b.score || "—"}** | ${b.attendanceRate || "—"} | ${b.activityRate || b.activityScore || "—"} | **${b.rank ? "Hạng " + b.rank : "—"}** |\n`;
        });
      } else if (d.branches) {
        md += `| Ngành | Điểm thi đua TB | Chuyên cần TB | Xếp hạng |\n`;
        md += `| :--- | :---: | :---: | :---: |\n`;
        d.branches.forEach((b) => {
          md += `| **Ngành ${b.name || b.branch}** | **${b.averageScore || "—"}** | ${b.attendanceRate || "—"} | ${b.rank || "—"} |\n`;
        });
      }
      return md;
    }

    case "get_subject_grades_analytics": {
      let md = `### 📊 Phân tích Điểm số theo Môn học\n\n`;
      const subjects = d.subjects || d.categories || [];
      if (subjects.length > 0) {
        md += `| Môn học / Hạng mục | Hệ số (Weight) | Điểm trung bình | Điểm cao nhất | Điểm thấp nhất |\n`;
        md += `| :--- | :---: | :---: | :---: | :---: |\n`;
        subjects.forEach((s) => {
          md += `| **${s.name}** | ${s.weight || 1} | **${s.averageScore || s.avgScore || "—"}** | ${s.maxScore || "—"} | ${s.minScore || "—"} |\n`;
        });
      }
      return md;
    }

    case "get_activities_summary": {
      let md = `### ⛺ Tổng kết Hoạt động & Phong trào Ngoại khóa\n\n`;
      const acts = d.activities || [];
      md += `Ghi nhận **${acts.length} hoạt động** trong kỳ:\n\n`;
      md += `| Ngày | Tên hoạt động | Số ĐS tham gia | Tỷ lệ tham gia |\n`;
      md += `| :---: | :--- | :---: | :---: |\n`;
      acts.forEach((a) => {
        md += `| ${a.date ? new Date(a.date).toLocaleDateString("vi-VN") : "—"} | **${a.name}** | ${a.participantCount || a.attendancesCount || 0} em | **${a.participationRate || "—"}** |\n`;
      });
      return md;
    }

    case "get_leaders_directory": {
      let md = `### 👔 Danh bạ Ban Trưởng & Ban Quản Trị\n\n`;
      const leaders = d.leaders || [];
      md += `| STT | Họ và tên | Chức vụ | Ngành phụ trách | Email liên hệ | SĐT |\n`;
      md += `| :---: | :--- | :--- | :--- | :--- | :--- |\n`;
      leaders.forEach((l, idx) => {
        md += `| ${idx + 1} | **${l.name}** | ${l.role || "Trưởng"} | ${l.branch ? "Ngành " + l.branch : "Toàn đoàn"} | \`${l.email || "—"}\` | \`${l.phone || "—"}\` |\n`;
      });
      return md;
    }

    case "get_emergency_contact_directory": {
      let md = `### 🚨 Danh bạ Liên lạc Khẩn cấp\n\n`;
      const members = d.members || [];
      md += `| STT | Họ và tên | Ngành | Chi đoàn | Tên Cha / Mẹ | SĐT Liên hệ | Địa chỉ |\n`;
      md += `| :---: | :--- | :---: | :---: | :--- | :--- | :--- |\n`;
      members.forEach((m, idx) => {
        const parents = [m.fatherName ? `Cha: ${m.fatherName}` : "", m.motherName ? `Mẹ: ${m.motherName}` : ""].filter(Boolean).join(", ") || "—";
        md += `| ${idx + 1} | **${m.name}** | ${m.branch || "—"} | ${m.group || "—"} | ${parents} | \`${m.contact || "—"}\` | ${m.address || "—"} |\n`;
      });
      return md;
    }

    case "get_attendance_streak_leaderboard": {
      let md = `### 🌟 Bảng Vàng Chuỗi Chuyên Cần Liên Tục\n\n`;
      const streaks = d.streaks || d.members || [];
      md += `| Hạng | Họ và tên | Ngành | Đội | Chuỗi hiện tại | Kỷ lục chuỗi |\n`;
      md += `| :---: | :--- | :---: | :---: | :---: | :---: |\n`;
      streaks.forEach((s, idx) => {
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
        md += `| ${medal} | **${s.name}** | ${s.branch} | ${s.group || "—"} | **${s.currentStreak || 0} buổi** | ${s.maxStreak || 0} buổi |\n`;
      });
      return md;
    }

    case "get_grade_distribution_summary": {
      let md = `### 📈 Phổ điểm & Phân bổ Xếp loại Học lực\n\n`;
      const dist = d.distribution || [];
      md += `| Xếp loại | Số lượng ĐS | Tỷ lệ % | Khoảng điểm |\n`;
      md += `| :--- | :---: | :---: | :---: |\n`;
      dist.forEach((di) => {
        md += `| **${di.rank || di.label}** | ${di.count} em | **${di.percentage || di.pct || "—"}** | ${di.range || "—"} |\n`;
      });
      return md;
    }

    case "get_upcoming_events": {
      let md = `### 📅 Lịch Hoạt động & Sự kiện Sắp Diễn Ra\n\n`;
      const evts = d.events || d.upcomingActivities || [];
      if (evts.length === 0) return md + "Hiện chưa có sự kiện nào được lên lịch sắp tới.";
      md += `| Ngày diễn ra | Tên sự kiện | Địa điểm / Mô tả |\n`;
      md += `| :---: | :--- | :--- |\n`;
      evts.forEach((e) => {
        md += `| **${e.date ? new Date(e.date).toLocaleDateString("vi-VN") : "—"}** | **${e.name}** | ${e.description || "—"} |\n`;
      });
      return md;
    }

    case "get_member_activity_history": {
      let md = `### 🏃 Lịch sử Tham gia Hoạt động Ngoại khóa\n\n`;
      md += `- **Đoàn sinh:** **${d.member?.name || "—"}** (Ngành ${d.member?.branch || "—"})\n`;
      md += `- **Tổng số hoạt động tham gia:** **${d.totalAttended || d.activities?.length || 0} sự kiện**\n\n`;
      if (d.activities && d.activities.length > 0) {
        md += `| Ngày | Tên hoạt động | Trạng thái | Ghi chú |\n`;
        md += `| :---: | :--- | :---: | :--- |\n`;
        d.activities.forEach((a) => {
          md += `| ${a.date ? new Date(a.date).toLocaleDateString("vi-VN") : "—"} | **${a.name}** | ${a.status || "Đã tham gia"} | ${a.note || "—"} |\n`;
        });
      }
      return md;
    }

    case "get_promotion_and_new_members": {
      let md = `### 🎖️ Thống kê Đoàn sinh Mới & Lên Ngành\n\n`;
      if (d.newMembers && d.newMembers.length > 0) {
        md += `#### 🌟 Đoàn sinh Mới Gia Nhập (${d.newMembers.length} em):\n\n`;
        md += `| STT | Họ và tên | Ngành | Năm gia nhập | Xã đạo |\n`;
        md += `| :---: | :--- | :---: | :---: | :--- |\n`;
        d.newMembers.slice(0, 20).forEach((m, idx) => {
          md += `| ${idx + 1} | **${m.name}** | ${m.branch} | ${m.startYear || "—"} | ${m.parish || "—"} |\n`;
        });
      }
      if (d.promotions && d.promotions.length > 0) {
        md += `\n#### 🏅 Lịch sử Thăng Cấp / Lên Ngành (${d.promotions.length} lượt):\n\n`;
        md += `| STT | Họ và tên | Ngày lên ngành | Từ ngành | Sang ngành |\n`;
        md += `| :---: | :--- | :---: | :---: | :---: |\n`;
        d.promotions.slice(0, 20).forEach((p, idx) => {
          md += `| ${idx + 1} | **${p.memberName || p.name}** | ${p.date ? new Date(p.date).toLocaleDateString("vi-VN") : "—"} | ${p.fromBranch} | **${p.toBranch}** |\n`;
        });
      }
      return md;
    }

    case "get_group_squad_distribution": {
      let md = `### 👥 Cơ cấu Phân chia Chi đoàn / Đội nhóm\n\n`;
      const groups = d.groups || d.ranking || [];
      md += `| Chi đoàn / Đội | Ngành | Số lượng ĐS | Tỷ lệ % |\n`;
      md += `| :--- | :---: | :---: | :---: |\n`;
      groups.forEach((g) => {
        md += `| **${g.name || g.group}** | ${g.branch || "—"} | **${g.count} em** | ${g.percentage || g.pct || "—"} |\n`;
      });
      return md;
    }

    case "get_leaders_contribution_stats": {
      let md = `### 🏅 Thống kê Đóng góp của Ban Trưởng\n\n`;
      const stats = d.leaders || d.stats || [];
      md += `| Họ và tên | Chức vụ | Ngành | Thâm niên | Sự kiện tổ chức | Lượt điểm danh |\n`;
      md += `| :--- | :--- | :--- | :---: | :---: | :---: |\n`;
      stats.forEach((s) => {
        md += `| **${s.name}** | ${s.role || "Trưởng"} | ${s.branch || "—"} | ${s.yearsActive ? s.yearsActive + " năm" : "—"} | ${s.activitiesCount || 0} | ${s.attendancesMarked || 0} |\n`;
      });
      return md;
    }

    case "get_scoring_rules_and_weights": {
      let md = `### ⚖️ Quy chế Chấm điểm & Hệ số Môn học\n\n`;
      const cats = d.categories || [];
      md += `| STT | Tên môn / Hạng mục | Hệ số (Weight) | Tỷ trọng | Trạng thái |\n`;
      md += `| :---: | :--- | :---: | :---: | :---: |\n`;
      cats.forEach((c, idx) => {
        md += `| ${idx + 1} | **${c.name}** | **${c.weight}** | ${c.percentage || "—"} | ${c.active ? "Đang áp dụng" : "Tạm ngưng"} |\n`;
      });
      return md;
    }

    case "get_yearly_summary_report": {
      let md = `### 📑 Báo cáo Tổng kết Toàn diện Niên khóa ${d.year || ""}\n\n`;
      md += `- **Tổng số đoàn sinh:** **${d.totalMembers || 0} em**\n`;
      md += `- **Tổng số buổi sinh hoạt:** **${d.totalSessions || 0} buổi**\n`;
      md += `- **Tỷ lệ chuyên cần cả năm:** **${d.attendanceRate || "—"}**\n`;
      md += `- **Tổng số sự kiện phong trào:** **${d.totalActivities || 0} sự kiện**\n`;
      md += `- **Số đoàn sinh lên ngành:** **${d.promotedCount || 0} em**\n`;
      return md;
    }

    case "get_leader_to_member_ratio": {
      let md = `### 👥 Tỷ lệ Trưởng / Đoàn sinh (Leader-to-Member Ratio)\n\n`;
      const ratios = d.ratios || d.branches || [];
      md += `| Ngành | Số Trưởng | Số Đoàn sinh | Tỷ lệ (1 Trưởng / X ĐS) | Đánh giá sư phạm |\n`;
      md += `| :--- | :---: | :---: | :---: | :--- |\n`;
      ratios.forEach((r) => {
        md += `| **Ngành ${r.branch || r.name}** | ${r.leaderCount} | ${r.memberCount} | **1 : ${r.ratio}** | ${r.assessment || "Tốt"} |\n`;
      });
      return md;
    }

    case "get_system_health_and_data_summary": {
      let md = `### 🛡️ Báo cáo Sức khỏe Dữ liệu Hệ thống\n\n`;
      md += `- **Tổng số đoàn sinh:** ${d.totalMembers || 0} (Đang sinh hoạt: **${d.activeCount || 0}**, Tạm ngưng: ${d.inactiveCount || 0})\n`;
      md += `- **Tỷ lệ có SĐT liên hệ:** **${d.phoneRate || d.contactRate || "—"}**\n`;
      md += `- **Tỷ lệ có ngày sinh:** **${d.birthDateRate || "—"}**\n`;
      md += `- **Tỷ lệ có địa chỉ:** **${d.addressRate || "—"}**\n`;
      md += `- **Tỷ lệ có thông tin phụ huynh:** **${d.parentsRate || "—"}**\n`;
      return md;
    }

    case "get_branch_contact_representatives": {
      let md = `### 📞 Danh bạ Đại diện Liên lạc Chính thức các Ngành\n\n`;
      const reps = d.representatives || d.leaders || [];
      md += `| Vai trò đại diện | Họ và tên | Ngành phụ trách | Email | SĐT |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      reps.forEach((r) => {
        md += `| **${r.roleTitle || r.role}** | **${r.name}** | ${r.branch} | \`${r.email || "—"}\` | \`${r.phone || "—"}\` |\n`;
      });
      return md;
    }

    case "get_sibling_family_groups": {
      let md = `### 👨‍👩‍👧‍👦 Gia đình có từ 2 Anh Chị Em ruột Cùng Sinh Hoạt\n\n`;
      const fams = d.families || [];
      md += `Ghi nhận **${fams.length} gia đình** có nhiều con em đang sinh hoạt:\n\n`;
      fams.forEach((f, idx) => {
        md += `#### ${idx + 1}. Gia đình phụ huynh: **${f.parentName || f.contact || "—"}** (SĐT: \`${f.contact || "—"}\`)\n`;
        md += `- **Địa chỉ:** ${f.address || "—"}\n`;
        md += `- **Các con sinh hoạt:** ${(f.members || []).map(m => "**" + m.name + "** (Ngành " + m.branch + ")").join(", ")}\n\n`;
      });
      return md;
    }

    case "get_inactive_and_dropped_members": {
      let md = `### ⏸️ Danh sách Đoàn sinh Tạm ngưng Sinh hoạt / Chuyển xứ\n\n`;
      const inactives = d.members || [];
      md += `| STT | Họ và tên | Ngành | Xã đạo | SĐT liên hệ | Ghi chú |\n`;
      md += `| :---: | :--- | :---: | :--- | :--- | :--- |\n`;
      inactives.forEach((m, idx) => {
        md += `| ${idx + 1} | **${m.name}** | ${m.branch || "—"} | ${m.parish || "—"} | \`${m.contact || "—"}\` | ${m.note || "Tạm ngưng"} |\n`;
      });
      return md;
    }

    case "get_grade_outliers_and_anomalies": {
      let md = `### ⚠️ Cảnh báo Điểm số Bất thường Cần Lưu Ý\n\n`;
      const anomalies = d.anomalies || [];
      if (anomalies.length === 0) return md + "Không phát hiện điểm số bất thường nào trong kỳ.";
      md += `| Họ và tên | Ngành | Môn học | Điểm số | Lý do cảnh báo |\n`;
      md += `| :--- | :---: | :--- | :---: | :--- |\n`;
      anomalies.forEach((a) => {
        md += `| **${a.name}** | ${a.branch} | ${a.subject || a.category} | **${a.score}** | ${a.reason} |\n`;
      });
      return md;
    }

    case "get_session_detailed_history": {
      let md = `### 📝 Nhật ký Chi tiết Buổi Sinh hoạt\n\n`;
      md += `- **Ngày sinh hoạt:** **${d.date || "—"}** | **Ngành:** **Ngành ${d.branch || "—"}**\n`;
      md += `- **Người điểm danh:** **${d.markedBy || "—"}**\n`;
      md += `- **Thống kê:** Hiện diện: **${d.presentCount || 0}** | Vắng không phép: **${d.absentCount || 0}** | Vắng phép: **${d.excusedCount || 0}** | Trễ: **${d.lateCount || 0}**\n\n`;
      if (d.absentList && d.absentList.length > 0) {
        md += `#### ⚠️ Danh sách vắng / trễ:\n\n`;
        md += `| STT | Họ và tên | Tình trạng | Lý do / Ghi chú | SĐT Ba Mẹ |\n`;
        md += `| :---: | :--- | :---: | :--- | :--- |\n`;
        d.absentList.forEach((a, idx) => {
          md += `| ${idx + 1} | **${a.name}** | ${a.status} | ${a.note || "—"} | \`${a.contact || "—"}\` |\n`;
        });
      }
      return md;
    }

    case "get_attendance_by_day_of_week": {
      let md = `### 📊 Phân tích Chuyên cần theo Ngày trong Tuần\n\n`;
      const days = d.days || d.stats || [];
      md += `| Ngày trong tuần | Số buổi tổ chức | Tỷ lệ chuyên cần TB | Đánh giá |\n`;
      md += `| :--- | :---: | :---: | :--- |\n`;
      days.forEach((day) => {
        md += `| **${day.dayName}** | ${day.sessionCount} buổi | **${day.attendanceRate}** | ${day.note || "Ổn định"} |\n`;
      });
      return md;
    }

    case "get_unassigned_members_and_leaders": {
      let md = `### 🔍 Rà soát Nhân sự Chưa Phân Công / Chưa Xếp Đội\n\n`;
      if (d.unassignedMembers && d.unassignedMembers.length > 0) {
        md += `#### 👥 Đoàn sinh chưa xếp Chi đoàn/Đội (${d.unassignedMembers.length} em):\n\n`;
        md += `| STT | Họ và tên | Ngành | Xã đạo | SĐT liên hệ |\n`;
        md += `| :---: | :--- | :---: | :--- | :--- |\n`;
        d.unassignedMembers.slice(0, 20).forEach((m, idx) => {
          md += `| ${idx + 1} | **${m.name}** | ${m.branch} | ${m.parish || "—"} | \`${m.contact || "—"}\` |\n`;
        });
      }
      if (d.unassignedLeaders && d.unassignedLeaders.length > 0) {
        md += `\n#### ⭐ Trưởng chưa gán Ngành phụ trách (${d.unassignedLeaders.length} người):\n\n`;
        md += `| STT | Họ và tên | Email | Vai trò |\n`;
        md += `| :---: | :--- | :--- | :--- |\n`;
        d.unassignedLeaders.forEach((l, idx) => {
          md += `| ${idx + 1} | **${l.name}** | \`${l.email || "—"}\` | ${l.role || "Trưởng"} |\n`;
        });
      }
      return md;
    }

    case "get_comprehensive_member_audit_card": {
      let md = `### 🪪 Thẻ Kiểm Toán Toàn Diện 360° Đoàn Sinh\n\n`;
      const m = d.member || d;
      md += `#### 👤 **${m.name}** (Mã ĐS: **${m.id}** - Ngành **${m.branch}** - Đội: **${m.group || "Chưa xếp"}**)\n`;
      md += `- **Ngày sinh:** ${m.birthDate || "*(Chưa cập nhật)*"} | **Giới tính:** ${m.gender || "—"}\n`;
      md += `- **Xã đạo:** ${m.parish || "—"} | **Họ Đạo:** ${m.church || "—"}\n`;
      md += `- **Phụ huynh:** Cha: **${m.fatherName || "—"}** - Mẹ: **${m.motherName || "—"}**\n`;
      md += `- **SĐT liên hệ:** \`${m.contact || "—"}\` | **Địa chỉ:** ${m.address || "—"}\n`;
      md += `- **Năm gia nhập:** ${m.startYear || "—"}\n\n`;

      if (d.yearlyAttendance) {
        md += `#### 📈 Chuyên cần Cả Năm: **${d.yearlyAttendance.rate || "—"}** (Điểm CC: **${d.yearlyAttendance.score || "—"}/10**)\n`;
      }
      if (d.quarterGrades && d.quarterGrades.length > 0) {
        md += `#### 📚 Bảng Điểm 4 Quý:\n\n`;
        md += `| Quý / Năm | Điểm TB | Điểm Chuyên cần | Điểm Hoạt động | Xếp loại |\n`;
        md += `| :---: | :---: | :---: | :---: | :---: |\n`;
        d.quarterGrades.forEach((g) => {
          md += `| **Quý ${g.quarter}/${g.year}** | **${g.avgScore || "—"}** | ${g.attendanceScore || "—"} | ${g.activityScore || "—"} | **${g.rank || "—"}** |\n`;
        });
      }
      return md;
    }

    case "get_attendance_trend": {
      let md = `### 📈 Xu hướng Chuyên cần theo Tuần (${d.branch === "all" ? "Toàn đoàn" : "Ngành " + d.branch})\n\n`;
      const trend = d.trend || d.weeklyTrend || [];
      md += `| Tuần / Buổi | Ngày sinh hoạt | Tỷ lệ hiện diện | Số vắng | Ghi chú |\n`;
      md += `| :---: | :---: | :---: | :---: | :--- |\n`;
      trend.forEach((t) => {
        md += `| **Tuần ${t.week || t.sessionNumber || "—"}** | ${t.date || "—"} | **${t.attendanceRate || t.rate || "—"}** | ${t.absentCount || 0} em | ${t.note || "Ổn định"} |\n`;
      });
      return md;
    }

    case "get_session_attendance_details": {
      let md = `### 📋 Chi tiết Điểm danh các Buổi Sinh hoạt Gần Đây\n\n`;
      const sessions = d.sessions || [];
      sessions.forEach((s) => {
        md += `#### 📅 Buổi ngày ${s.date} (Ngành ${s.branch})\n`;
        md += `- Hiện diện: **${s.presentCount || 0} em** | Vắng phép: ${s.excusedCount || 0} | Vắng không phép: ${s.absentCount || 0} | Trễ: ${s.lateCount || 0}\n`;
        if (s.absentees && s.absentees.length > 0) {
          md += `- Danh sách vắng/trễ: ${s.absentees.map(a => "**" + a.name + "** (" + a.status + ")").join(", ")}\n`;
        }
        md += `\n`;
      });
      return md;
    }

    default: {
      if (d.summaryMessage) return d.summaryMessage;
      if (d.note) return d.note;
      if (Array.isArray(d) && d.length === 0) return `🔍 Không tìm thấy dữ liệu phù hợp trong hệ thống.`;
      if (d.count === 0 || (Array.isArray(d.members) && d.members.length === 0)) {
        return `🔍 Không tìm thấy dữ liệu phù hợp trong hệ thống.`;
      }
      return `Dưới đây là kết quả tra cứu dữ liệu thực tế từ hệ thống:\n\n` + JSON.stringify(d, null, 2);
    }
  }
}

function sanitizeAiResponse(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/Huynh [Tt]rưởng/g, "Trưởng")
    .replace(/Huỳnh [Tt]rưởng/g, "Trưởng")
    .replace(/huynh trưởng/gi, "Trưởng")
    .replace(/Huynh Trưởng/gi, "Trưởng")
    .replace(/huỳnh trưởng/gi, "Trưởng");
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. MAIN CHAT PROCESSING FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
async function processChatMessage({ message, history = [], userContext }) {
  if (!message || typeof message !== "string" || !message.trim()) {
    throw new Error("Tin nhắn không được để trống");
  }

  const trimmedMessage = message.trim();
  const normalizedMessage = normalizeUserQuery(trimmedMessage) || trimmedMessage;
  if (normalizedMessage !== trimmedMessage) {
    console.log(`🔍 [AI Normalizer] "${trimmedMessage}" ➔ "${normalizedMessage}"`);
  }

  // Nếu không có API Key, dùng bộ phân tích thông minh Deterministic Fallback
  if (!GEMINI_API_KEY) {
    console.log("ℹ️ GEMINI_API_KEY chưa cấu hình, sử dụng Smart Analytic Fallback");
    const fallbackText = await generateFallbackResponse(normalizedMessage, userContext);
    return {
      reply: sanitizeAiResponse(fallbackText),
      modelUsed: "local-analyst-fallback",
    };
  }

  try {
    const systemInstruction = {
      role: "system",
      parts: [{ text: buildSystemPrompt(userContext) }],
    };

    // Format chat history for Gemini API
    const formattedContents = [];
    if (Array.isArray(history)) {
      history.slice(-8).forEach((item) => {
        if (item.sender === "user") {
          formattedContents.push({ role: "user", parts: [{ text: item.text }] });
        } else if (item.sender === "ai") {
          formattedContents.push({ role: "model", parts: [{ text: item.text }] });
        }
      });
    }

    // Add current user prompt (using clean normalized message)
    formattedContents.push({
      role: "user",
      parts: [{ text: normalizedMessage }],
    });

    const requestPayload = {
      systemInstruction,
      contents: formattedContents,
      tools: [{ functionDeclarations: toolDeclarations }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1500,
      },
    };

    const { response, modelUsed } = await callGeminiApi(requestPayload);

    let candidate = response.data?.candidates?.[0];
    let modelParts = candidate?.content?.parts || [];

    // Kiểm tra xem Gemini có yêu cầu gọi Function Tool không
    const functionCallParts = modelParts.filter((p) => p.functionCall);

    if (functionCallParts.length > 0) {
      const executedToolNames = [];
      const toolResponses = [];
      let lastToolResult = null;
      let lastToolName = null;

      for (const part of functionCallParts) {
        const call = part.functionCall;
        console.log(`🤖 Gemini (${modelUsed}) requesting tool call: ${call.name} with args:`, call.args);
        executedToolNames.push(call.name);
        lastToolName = call.name;

        const toolResult = await executeTool(call.name, call.args, userContext);
        lastToolResult = toolResult;
        toolResponses.push({
          functionResponse: {
            name: call.name,
            response: { result: toolResult },
            ...(call.id ? { id: call.id } : {}),
          },
        });
      }

      // Gửi kết quả tool lại cho Gemini
      const secondTurnContents = [
        ...formattedContents,
        candidate.content,
        {
          role: "user",
          parts: toolResponses,
        },
      ];

      const secondTurnPayload = {
        systemInstruction,
        contents: secondTurnContents,
        tools: [{ functionDeclarations: toolDeclarations }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000,
        },
      };

      let reply = "";
      try {
        const secondRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelUsed}:generateContent?key=${GEMINI_API_KEY}`,
          secondTurnPayload,
          {
            headers: { "Content-Type": "application/json" },
            timeout: 45000,
          }
        );

        const finalCandidate = secondRes.data?.candidates?.[0];
        const textParts = finalCandidate?.content?.parts?.filter((p) => p.text).map((p) => p.text) || [];
        reply = textParts.join("\n\n").trim();
      } catch (secondErr) {
        console.warn(`⚠️ Second turn for ${modelUsed} failed (${secondErr?.response?.status}): ${secondErr.message}. Synthesizing directly from tool results...`);
        // Failover: thử gọi model thứ hai nếu còn trong danh sách
        const backupModel = GEMINI_MODELS_TO_TRY.find((m) => m !== modelUsed);
        if (backupModel) {
          try {
            const backupRes = await axios.post(
              `https://generativelanguage.googleapis.com/v1beta/models/${backupModel}:generateContent?key=${GEMINI_API_KEY}`,
              secondTurnPayload,
              { headers: { "Content-Type": "application/json" }, timeout: 45000 }
            );
            const bCandidate = backupRes.data?.candidates?.[0];
            const bParts = bCandidate?.content?.parts?.filter((p) => p.text).map((p) => p.text) || [];
            reply = bParts.join("\n\n").trim();
          } catch (e2) {
            console.warn(`⚠️ Backup model ${backupModel} also failed. Using tool formatter.`);
          }
        }
      }

      if (!reply) {
        console.warn("⚠️ Synthesizing reply directly from tool results.");
        reply = (lastToolName && lastToolResult)
          ? formatToolResultToMarkdown(lastToolName, lastToolResult)
          : await generateFallbackResponse(trimmedMessage, userContext);
      }

      return {
        reply: sanitizeAiResponse(reply),
        toolCalled: executedToolNames.join(", "),
        modelUsed,
      };
    }

    // Nếu không cần gọi tool, trả về text trực tiếp
    const textParts = modelParts.filter((p) => p.text).map((p) => p.text) || [];
    let reply = textParts.join("\n\n").trim();

    return {
      reply: sanitizeAiResponse(reply || (await generateFallbackResponse(trimmedMessage, userContext))),
      modelUsed,
    };
  } catch (err) {
    console.error("Gemini API Error:", err?.response?.data || err.message);
    // Fallback mượt mà nếu Gemini gặp lỗi quota hoặc model name
    const fallbackText = await generateFallbackResponse(trimmedMessage, userContext);
    return {
      reply: sanitizeAiResponse(fallbackText),
      modelUsed: "local-analyst-fallback (api error)",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. QUICK SUGGESTIONS
// ─────────────────────────────────────────────────────────────────────────────
function getQuickSuggestions(userContext) {
  const isBranchLeader = userContext?.role !== "admin" && userContext?.branch;
  const branchName = userContext?.branch ? "Ngành " + userContext.branch : "Ngành";

  return {
    parents: [
      "Bé 8 tuổi học ngành nào, ai phụ trách?",
      "Giờ sinh hoạt Chúa Nhật và quy định đồng phục",
      "Học phí và cách thức đăng ký tham gia",
      "Xin phép nghỉ học cho con thì nhắn cho ai?",
      "Số điện thoại Trưởng phụ trách các ngành",
    ],
    newcomers: [
      "Gia Đình Hưng Đạo Trung Nam là gì?",
      "Bốn tôn chỉ của Thiếu Nhi Thánh Thể là gì?",
      "Ý nghĩa màu khăn các ngành Đồng, Thiếu, Thanh",
      "Có hoạt động cắm trại, dã ngoại không?",
      "Ngày Lễ Bổn mạng Gia Đình Hưng Đạo",
    ],
    leaders: isBranchLeader ? [
      `Tóm tắt tình hình ${branchName} Quý này`,
      `Những em nào trong ${branchName} vắng nhiều cần thăm hỏi?`,
      `Ai có sinh nhật trong 30 ngày tới?`,
      `Tiến độ kế hoạch bài học ${branchName} Quý này`,
      `Top đoàn sinh điểm cao nhất ${branchName}`,
    ] : [
      "Tóm tắt tình hình Gia Đình Hưng Đạo Quý này",
      "Những đoàn sinh vắng nhiều cần thăm hỏi",
      "Ai có sinh nhật trong 30 ngày tới?",
      "So sánh tỷ lệ chuyên cần giữa các Ngành",
      "Danh bạ số điện thoại liên lạc khẩn cấp phụ huynh",
    ],
    general: [
      "Bé 8 tuổi học ngành nào, ai phụ trách?",
      "Giờ sinh hoạt Chúa Nhật và quy định đồng phục",
      "Những đoàn sinh vắng nhiều cần thăm hỏi",
      "Học phí và cách thức đăng ký tham gia",
      "Số điện thoại Trưởng phụ trách các ngành",
      "Ai có sinh nhật trong 30 ngày tới?",
    ],
  };
}

module.exports = {
  processChatMessage,
  getQuickSuggestions,
  executeTool,
  toolDeclarations,
  formatToolResultToMarkdown,
  generateFallbackResponse,
};