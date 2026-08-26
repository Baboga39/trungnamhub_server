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
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3-flash-preview",
  "gemini-3.6-flash",
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
        branch: { type: "STRING", description: "Tên Ngành (Đồng, Thiếu, Thanh, hoặc 'all' cho toàn Gia Đình Hưng Đạo)" },
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
          description: "Trường cần nhóm: 'parish' (xã đạo/Xã đạo), 'church' (Họ Đạo/nhà thờ), 'gender' (giới tính), 'group' (chi đoàn/đội), 'branch' (ngành), 'birthYear' (năm sinh/độ tuổi)",
        },
        branch: {
          type: "STRING",
          description: "Ngành lọc (Đồng, Thiếu, Thanh, hoặc 'all' cho toàn Gia Đình Hưng Đạo)",
        },
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
    description: "Danh sách Huynh Trưởng, Ban Quản Trị và Phân công trách nhiệm theo từng Ngành.",
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
    description: "Tra cứu danh sách đoàn sinh có sinh nhật trong Quý hoặc Tháng cụ thể (ngày sinh, tháng sinh, tuổi, ngành, chi đoàn, Xã đạo/xã đạo, mừng tuổi mới) của các ngành hoặc toàn Gia Đình Hưng Đạo.",
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
    description: "Bảng vàng chuỗi chuyên cần (Top đoàn sinh có chuỗi tham gia sinh hoạt liên tục dài nhất hiện tại và kỷ lục dài nhất lịch sử). Có thể lọc theo ngành hoặc xem toàn xứ đoàn.",
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
    description: "Cảnh báo danh sách các đoàn sinh vắng liên tiếp từ 2 đến 3+ buổi sinh hoạt gần nhất để Huynh Trưởng và Ban Quản Trị kịp thời nắm bắt và liên hệ thăm hỏi gia đình.",
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
    description: "Thống kê danh sách đoàn sinh mới gia nhập gần đây và lịch sử chuyển ngành, thăng cấp bậc trong Xứ Đoàn.",
    parameters: {
      type: "OBJECT",
      properties: {
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
    description: "Thống kê chi tiết mức độ đóng góp của Ban Huynh Trưởng: thâm niên gắn bó (năm bắt đầu), số sự kiện/hoạt động đã tổ chức, số buổi sinh hoạt và lượt điểm danh đã thực hiện.",
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
    description: "Thống kê tỷ lệ nhân sự Huynh Trưởng trên số lượng Đoàn sinh (Leader-to-Member Ratio) của từng ngành và đánh giá mức độ bao quát nhân sự theo chuẩn sư phạm TNTT.",
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
    description: "Danh bạ đại diện liên lạc chính thức của từng ngành (Xứ Đoàn Trưởng, Thiếu Trưởng, Đồng Trưởng, Thanh Trưởng) để phụ huynh hoặc người mới tiện liên hệ.",
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
    description: "Tìm kiếm các gia đình có từ 2 anh chị em ruột trở lên cùng sinh hoạt trong Xứ Đoàn (cùng SĐT phụ huynh hoặc cùng ba mẹ/địa chỉ) để hỗ trợ liên lạc gia đình.",
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
    description: "Kiểm tra mức độ chuẩn bị bài học/giáo án trong Quý: số bài đã gán Huynh trưởng phụ trách, số bài đã chuẩn bị tài liệu (prepared=true), số bài đã upload file đính kèm.",
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
    description: "Phát hiện các trường hợp bất thường về điểm số: chênh lệch điểm quá lớn giữa các môn học hoặc có môn đạt điểm dưới trung bình (<5.0) để Huynh trưởng kèm cặp.",
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
    description: "Rà soát danh sách đoàn sinh chưa được xếp vào Chi đoàn/Đội nào hoặc thiếu thông tin Họ Đạo, và Huynh trưởng chưa được gán ngành phụ trách.",
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

      // 4. Tra cứu chi tiết hồ sơ cá nhân đoàn sinh
      case "search_member_profile": {
        const query = (args.query || "").trim();
        const where = {
          active: true,
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { parish: { contains: query, mode: "insensitive" } },
            { group: { contains: query, mode: "insensitive" } },
          ],
        };
        if (branch && branch !== "all") {
          where.branch = branch;
        }

        const members = await prisma.member.findMany({
          where,
          take: 5,
          include: {
            grades: {
              where: { year, quarter },
              include: { category: true },
            },
            attendances: {
              take: 8,
              orderBy: { date: "desc" },
            },
            statusHistory: {
              take: 3,
              orderBy: { date: "desc" },
            },
          },
        });

        if (members.length === 0) {
          const matchingUsers = await prisma.user.findMany({
            where: {
              active: true,
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
              ],
            },
            take: 3,
          });

          if (matchingUsers.length > 0) {
            const formattedLeaders = matchingUsers.map((u) => ({
              id: u.id,
              name: u.name,
              role: u.role || "Huynh Trưởng",
              branch: u.branch ? `Ngành ${u.branch}` : "Toàn Gia Đình Hưng Đạo",
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
                note: `Không tìm thấy đoàn sinh tên '${query}', nhưng tìm thấy thông tin Huynh Trưởng / Ban Quản Trị trong hệ thống.`,
              },
            };
          }
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

          const presentCount = m.attendances.filter((a) => a.status === "PRESENT").length;
          const totalAtt = m.attendances.length;
          const attRate = totalAtt > 0 ? Math.round((presentCount / totalAtt) * 100) + "%" : "Chưa có";

          return {
            id: m.id,
            name: m.name,
            gender: m.gender || "—",
            birthDate: m.birthDate ? new Date(m.birthDate).toLocaleDateString("vi-VN") : "—",
            branch: m.branch,
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
            recentAttendances: m.attendances.map((a) => ({
              date: new Date(a.date).toLocaleDateString("vi-VN"),
              status: a.status,
            })),
            statusHistory: m.statusHistory.map((s) => ({
              type: s.type,
              date: new Date(s.date).toLocaleDateString("vi-VN"),
              fromBranch: s.fromBranch,
              toBranch: s.toBranch,
            })),
          };
        });

        return { success: true, data: { count: formatted.length, members: formatted } };
      }

      // 5. Top đoàn sinh xuất sắc
      case "get_top_members": {
        const limit = args.limit ? Number(args.limit) : 10;
        const sortBy = args.sortBy || "overall";
        const data = await executiveDashboardService.getExecutiveTopMembers(userContext, { year, quarter, branch, sortBy, limit });
        return { success: true, data };
      }

      // 6. Đoàn sinh diện cảnh báo nguy cơ
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
            branch: s.branch ? `Ngành ${s.branch}` : "Toàn Gia Đình Hưng Đạo",
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
            branch: s.branch ? `Ngành ${s.branch}` : "Toàn Gia Đình Hưng Đạo",
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
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`,
            curriculumStatus: programStatus,
            lessonSchedule: programLessons,
            totalWeeklySessions: formattedSessions.length,
            weeklySessions: formattedSessions,
            totalActivities: formattedActivities.length,
            activities: formattedActivities,
          },
        };
      }

      // 12. Danh bạ Huynh Trưởng & BQT
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
          role: u.role || "Huynh Trưởng",
          branch: u.branch ? `Ngành ${u.branch}` : "Toàn Gia Đình Hưng Đạo",
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
                title: `Chương trình sinh hoạt Quý ${p.quarter}/${p.year} - ${bName.startsWith("Ngành") ? bName : `Ngành ${bName}`}`,
                status: p.status,
                branch: bName,
                year: p.year,
                quarter: p.quarter,
                lessonCount: p.lessonCount || 0,
                createdBy: p.createdBy ? `Huynh Trưởng #${p.createdBy}` : "—",
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
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`,
            totalBirthdays: filteredMembers.length,
            byMonth: data.byMonth,
            birthdays: filteredMembers.map((m) => ({
              id: m.id,
              name: m.fullName,
              birthDate: m.formattedDate + (m.birthYear ? `/${m.birthYear}` : ""),
              birthMonth: m.birthMonth,
              birthDay: m.birthDay,
              branch: m.branch ? `Ngành ${m.branch}` : "—",
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
              branch: m.branch ? `Ngành ${m.branch}` : "—",
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
            branch: targetBranch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${targetBranch}`,
            count: streaks.length,
            topStreaks: streaks.map((s, idx) => ({
              rank: idx + 1,
              id: s.id,
              name: s.fullName,
              branch: `Ngành ${s.branch}`,
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
            status: { in: ["ABSENT", "ABSENT_WITHOUT_PERMISSION", "ABSENT_WITH_PERMISSION", "EXCUSED"] },
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
            branch: item.member.branch ? `Ngành ${item.member.branch}` : "—",
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
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`,
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
            branch: member.branch ? `Ngành ${member.branch}` : "—",
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
        const [promotions, newMembers] = await Promise.all([
          prisma.memberStatusHistory.findMany({
            take: 10,
            orderBy: { date: "desc" },
            include: { member: { select: { id: true, name: true, branch: true } } },
          }),
          prisma.member.findMany({
            where: { active: true, ...(branch && branch !== "all" ? { branch } : {}) },
            take: 10,
            orderBy: { createdAt: "desc" },
            select: { id: true, name: true, branch: true, group: true, parish: true, createdAt: true },
          }),
        ]);

        return {
          success: true,
          data: {
            recentPromotions: promotions.map((p) => ({
              memberName: p.member?.name || "Đoàn sinh",
              type: p.type,
              date: new Date(p.date).toLocaleDateString("vi-VN"),
              fromBranch: p.fromBranch || "—",
              toBranch: p.toBranch || "—",
            })),
            newlyEnrolledMembers: newMembers.map((m) => ({
              memberName: m.name,
              branch: m.branch ? `Ngành ${m.branch}` : "—",
              group: m.group || "—",
              parish: m.parish || "—",
              enrolledDate: new Date(m.createdAt).toLocaleDateString("vi-VN"),
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
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`,
            totalGroups: groups.length,
            groups: groups.map((g) => ({
              branch: g.branch ? `Ngành ${g.branch}` : "Chưa phân ngành",
              groupName: g.group || "Chưa xếp đội/chi đoàn",
              memberCount: g._count.id,
            })),
          },
        };
      }

      // 24. Thống kê mức độ cống hiến của Huynh Trưởng
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
              role: u.role || "Huynh Trưởng",
              branch: u.branch ? `Ngành ${u.branch}` : "Toàn Gia Đình Hưng Đạo",
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
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`,
            totalActiveMembers: totalMembers,
            totalSessionsHeld: allSessions.length,
            totalActivitiesOrganized: allActivities.length,
            promotedMembersCount: allPromotions,
            yearlyAttendanceRate,
            activities: allActivities.map((a) => a.name),
          },
        };
      }

      // 26. Tỷ lệ Huynh Trưởng / Đoàn sinh (Leader-to-Member Ratio)
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
          if (lCount === 0) assessment = "Thiếu Huynh Trưởng";
          else if (mCount / lCount > 15) assessment = "Cần tăng cường thêm Huynh Trưởng";
          else if (mCount / lCount <= 7) assessment = "Rất tối ưu, chăm sóc kèm cặp sát sao";

          return {
            branch: `Ngành ${b}`,
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
          role: u.role === "admin" ? "Ban Quản Trị (Admin)" : u.role || "Huynh Trưởng",
          branch: u.branch ? `Ngành ${u.branch}` : "Toàn Xứ Đoàn",
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
                  branch: `Ngành ${c.branch}`,
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
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`,
            count: inactiveMembers.length,
            members: inactiveMembers.map((m) => ({
              name: m.name,
              branch: `Ngành ${m.branch}`,
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
        let programs = [];
        try {
          const serviceToken = jwt.sign({ userId: 1, email: "ai-service@trungnam.org", role: "admin" }, JWT_SECRET, { expiresIn: "10m" });
          const pRes = await axios.get(`${PROGRAM_SERVER_URL}/api/v1/programs`, {
            headers: { Authorization: `Bearer ${serviceToken}` },
            timeout: 5000,
          });
          programs = pRes.data?.data?.programs || pRes.data?.data || [];
        } catch (err) {
          console.warn("Could not query program server for readiness:", err.message);
        }

        const filtered = programs.filter((p) => {
          if (p.year && Number(p.year) !== year) return false;
          if (p.quarter && Number(p.quarter) !== quarter) return false;
          if (branch !== "all" && p.branchId !== branch) return false;
          return true;
        });

        let totalLessons = 0;
        let preparedCount = 0;
        let assignedLeaderCount = 0;
        let withFilesCount = 0;
        const lessonList = [];

        for (const prog of filtered) {
          const lessons = prog.lessons || [];
          totalLessons += lessons.length;
          for (const l of lessons) {
            if (l.prepared) preparedCount++;
            if (l.leaders && l.leaders.length > 0) assignedLeaderCount++;
            if (l.files && l.files.length > 0) withFilesCount++;
            lessonList.push({
              title: l.title || l.name,
              branch: prog.branchId || "—",
              date: l.date ? new Date(l.date).toLocaleDateString("vi-VN") : "—",
              prepared: l.prepared ? "✅ Đã chuẩn bị" : "⏳ Chưa chuẩn bị",
              leaders: l.leaders?.map((ldr) => ldr.name || `HT #${ldr.userId}`).join(", ") || "Chưa phân công",
              filesCount: l.files?.length || 0,
            });
          }
        }

        return {
          success: true,
          data: {
            year,
            quarter,
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`,
            totalLessons,
            preparedCount,
            unpreparedCount: Math.max(0, totalLessons - preparedCount),
            assignedLeaderCount,
            withFilesCount,
            readinessRate: totalLessons > 0 ? `${((preparedCount / totalLessons) * 100).toFixed(1)}%` : "0%",
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
              branch: `Ngành ${m.branch}`,
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
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`,
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
            branch: `Ngành ${session.branch}`,
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
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`,
            totalSessions: sessions.length,
            distribution: Object.entries(dayStats).map(([day, st]) => ({
              day,
              sessionsCount: st.count,
              averageAbsentsPerSession: st.count > 0 ? (st.totalAbsents / st.count).toFixed(1) : 0,
            })),
          },
        };
      }

      // 39. Rà soát thành viên / Huynh trưởng chưa được phân công
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
            branch: branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`,
            totalActiveMembersInScope: totalBranchMembers,
            unassignedGroupMembersCount: unassignedMembers.length,
            unassignedLeadersCount: unassignedLeaders.length,
            missingChurchMembersCount: missingChurchMembers.length,
            unassignedMembersList: unassignedMembers.map((m) => ({ name: m.name, branch: `Ngành ${m.branch}`, parish: m.parish || "—", phone: m.contact || "—" })),
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
              branch: `Ngành ${member.branch}`,
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
              from: h.fromBranch ? `Ngành ${h.fromBranch}` : "Gia nhập",
              to: h.toBranch ? `Ngành ${h.toBranch}` : "—",
              date: new Date(h.createdAt).toLocaleDateString("vi-VN"),
              note: h.reason || "—",
            })),
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
  const userRole = userContext?.role === "admin" ? "Ban Quản Trị (Admin)" : "Huỳnh Trưởng";
  const branchScope = "Bạn có thể xem toàn bộ dữ liệu tất cả các Ngành (Đồng, Thiếu, Thanh) mà không bị giới hạn. Luôn tra cứu đúng ngành mà người dùng đề cập trong câu hỏi. Nếu không đề cập ngành cụ thể, hãy trả về tổng hợp toàn Gia Đình Hưng Đạo.";

  return `Bạn là Trợ lý AI Phân tích Dữ liệu Toàn diện của Trung Nam Hub, hệ thống quản trị Gia Đình Hưng Đạo Thiếu Nhi Thánh Thể.
Vai trò người dùng hiện tại: ${userRole}.
${branchScope}

Nguyên tắc bắt buộc:
1. 100% DỮ LIỆU THỰC TẾ TỪ DATABASE: Mọi thông tin (độ tuổi, năm sinh, sĩ số, chuyên cần, điểm số, nhân sự, giáo án, phê duyệt) BẮT BUỘC phải gọi Công cụ (AI Tools) để truy vấn từ cơ sở dữ liệu. Tuyệt đối không tự suy diễn hoặc dùng kiến thức lý thuyết chung ngoài đời.
2. Khi người dùng hỏi về ĐỘ TUỔI, NĂM SINH, CƠ CẤU NHÂN KHẨU (ví dụ: "các bạn độ tuổi từ bao nhiêu đến bao nhiêu", "bao nhiêu tuổi", "sinh năm mấy"): BẮT BUỘC gọi công cụ \`get_member_demographics\` với tham số \`groupBy: 'birthYear'\` để tính toán độ tuổi thực tế từ Database.

Danh sách 36 Công cụ (AI Tools) chuyên sâu bạn sở hữu:
1. 📊 Điều hành & Tổng quan: \`get_executive_overview\`, \`get_branch_performance\`, \`get_yearly_summary_report\`, \`get_system_health_and_data_summary\`
2. 👥 Nhân sự & Quản trị Đoàn sinh: \`get_member_demographics\`, \`search_member_profile\`, \`get_emergency_contact_directory\`, \`get_sibling_family_groups\`, \`get_inactive_and_dropped_members\`, \`get_unassigned_members_and_leaders\`, \`get_comprehensive_member_audit_card\`
3. 📈 Chuyên cần & Điểm danh: \`get_attendance_analytics\`, \`get_attendance_streak_leaderboard\`, \`get_consecutive_absent_alerts\`, \`get_session_detailed_history\`, \`get_attendance_by_day_of_week\`, \`get_attendance_trend\`, \`get_session_attendance_details\`
4. 📚 Học tập & Điểm số: \`get_subject_grades_analytics\`, \`get_grade_distribution_summary\`, \`get_grade_outliers_and_anomalies\`, \`get_scoring_rules_and_weights\`, \`get_top_members\`, \`get_top_performers\`, \`get_risk_members\`, \`get_at_risk_members\`
5. 📖 Kế hoạch sinh hoạt, Giáo án & Phê duyệt: \`get_quarter_programs\`, \`get_lesson_preparation_readiness\`, \`get_documents_and_approvals\`
6. ⛺ Sự kiện, Ngoại khóa & Thăng tiến: \`get_activities_summary\`, \`get_upcoming_events\`, \`get_member_activity_history\`, \`get_promotion_and_new_members\`, \`get_quarterly_birthdays\`
7. 👔 Ban Huynh Trưởng & Đội nhóm: \`get_leaders_directory\`, \`get_leaders_contribution_stats\`, \`get_group_squad_distribution\`, \`get_church_parish_breakdown\`, \`get_branch_contact_representatives\`, \`get_leader_to_member_ratio\`

Phong cách trả lời:
- Trả lời bằng tiếng Việt tự nhiên, chuẩn mực, đúng trọng tâm câu hỏi.
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
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;

  let branch = "all";
  if (q.includes("thiếu")) branch = "Thiếu";
  else if (q.includes("đồng")) branch = "Đồng";
  else if (q.includes("thanh")) branch = "Thanh";

  try {
    // 0. Sinh nhật theo Quý / Tháng
    if (q.includes("sinh nhật") || q.includes("ngày sinh") || q.includes("tuổi mới") || q.includes("sinh tháng")) {
      const bData = await dashboardService.getQuarterlyBirthdays({ role: "admin" }, { year: currentYear, quarter: currentQuarter, branch });
      const members = bData?.members || [];
      if (members.length === 0) {
        return `Hiện chưa có thông tin đoàn sinh nào có sinh nhật trong Quý ${currentQuarter}/${currentYear} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`}).`;
      }
      let md = `### 🎂 Danh sách Đoàn sinh có Sinh nhật trong Quý ${currentQuarter}/${currentYear} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`})\n\n`;
      md += `Hệ thống ghi nhận **${members.length} đoàn sinh** đón tuổi mới trong quý này:\n\n`;
      md += `| Ngày sinh | Đoàn sinh | Ngành | Chi đoàn/Đội | Xã đạo/Xã đạo | Tuổi mới |\n`;
      md += `| :---: | :--- | :--- | :--- | :--- | :---: |\n`;
      members.forEach((m) => {
        md += `| **${m.formattedDate}** | **${m.fullName}** | ${m.branch ? `Ngành ${m.branch}` : "—"} | ${m.group || "—"} | ${m.parish || "—"} | ${m.age ? `${m.age} tuổi` : "—"} |\n`;
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
        return `Hiện chưa có thông tin dữ liệu về ${groupTitle.toLowerCase()} của đoàn sinh (${branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`}).`;
      }

      const top1 = sorted[0];
      let md = `### 📍 Thống kê phân bố Đoàn sinh theo ${groupTitle} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`})\n\n`;
      md += `Đoàn sinh tập trung nhiều nhất tại **${top1.name}** với **${top1.count} em** (${top1.pct}% trên tổng số ${total} đoàn sinh).\n\n`;
      md += `| ${groupTitle} | Số lượng | Tỷ lệ |\n`;
      md += `| :--- | :---: | :---: |\n`;
      sorted.forEach((item) => {
        md += `| **${item.name}** | ${item.count} em | ${item.pct}% |\n`;
      });
      md += `\n💡 *Bạn có thể hỏi thêm: "Top điểm cao nhất", "Tình hình chuyên cần", hoặc "Danh sách nguy cơ".*`;
      return md;
    }

    // 2. Tra cứu chi tiết hồ sơ đoàn sinh
    if (q.includes("tìm em") || q.includes("thông tin em") || q.includes("hồ sơ") || q.includes("đoàn sinh tên") || q.includes("ai là") || q.includes("tìm đoàn sinh")) {
      const searchWords = message.replace(/(tìm|thông tin|hồ sơ|đoàn sinh|em|ai là)/gi, "").trim();
      const where = {
        active: true,
        OR: [
          { name: { contains: searchWords, mode: "insensitive" } },
          { parish: { contains: searchWords, mode: "insensitive" } },
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
        return `Không tìm thấy đoàn sinh nào phù hợp với từ khóa **"${searchWords}"** trong phạm vi quản lý của bạn.`;
      }

      let md = `### 🔍 Kết quả tìm kiếm đoàn sinh ("${searchWords}")\n\n`;
      members.forEach((m) => {
        md += `#### 👤 **${m.name}** (Ngành ${m.branch} - Chi đoàn: ${m.group || "—"})\n`;
        md += `- **Ngày sinh:** ${m.birthDate ? new Date(m.birthDate).toLocaleDateString("vi-VN") : "—"} | **Giới tính:** ${m.gender || "—"}\n`;
        md += `- **Xã đạo:** ${m.parish || "—"} | **Họ Đạo:** ${m.church || "—"}\n`;
        md += `- **Cha mẹ:** ${m.fatherName || "—"} / ${m.motherName || "—"} | **SĐT:** ${m.contact || "—"}\n`;
        md += `- **Địa chỉ:** ${m.address || "—"}\n`;
        if (m.grades?.length > 0) {
          md += `- **Điểm các môn (Q${currentQuarter}):** ` + m.grades.map((g) => `${g.category?.name}: **${g.score}**`).join(", ") + `\n`;
        }
        md += `\n---\n`;
      });
      return md;
    }

    // 3. Tra cứu nguy cơ / cảnh báo
    if (q.includes("cảnh báo") || q.includes("nguy cơ") || q.includes("vắng nhiều") || q.includes("yếu") || q.includes("kém") || q.includes("nghỉ")) {
      const risks = await executiveDashboardService.getExecutiveRiskMembers(userContext, { year: currentYear, quarter: currentQuarter, branch });
      if (!risks || risks.length === 0) {
        return `### 🛡️ Tình hình Đoàn sinh diện Cảnh báo (Quý ${currentQuarter}/${currentYear} - ${branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`})\n\nHiện tại **không có đoàn sinh nào** thuộc diện cảnh báo nguy cơ nghiêm trọng trong phạm vi quản lý của bạn. Tỷ lệ chuyên cần và điểm số duy trì ở mức an toàn! 🎉`;
      }
      const topRisks = risks.slice(0, 5);
      let md = `### ⚠️ Danh sách Đoàn sinh cần chú ý (Quý ${currentQuarter}/${currentYear} - ${branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`})\n\n`;
      md += `Hệ thống ghi nhận **${risks.length} đoàn sinh** có dấu hiệu vắng học hoặc điểm số giảm sút:\n\n`;
      md += `| Đoàn sinh | Ngành | Điểm TB | Vắng quy đổi | Lý do chính |\n`;
      md += `| :--- | :--- | :---: | :---: | :--- |\n`;
      topRisks.forEach((r) => {
        md += `| **${r.fullName}** | ${r.branch} | ${r.averageGrade ?? "—"} | ${r.attendanceEquivalent}b | ${r.reasons?.join("; ") || "Chuyên cần thấp"} |\n`;
      });
      md += `\n💡 **Gợi ý hành động:** Huỳnh Trưởng nên chủ động liên hệ phụ huynh hoặc trao đổi riêng để động viên các em tham gia sinh hoạt đều đặn hơn.`;
      return md;
    }

    // 4. Tra cứu Top điểm / Thi đua
    if (q.includes("top") || q.includes("cao nhất") || q.includes("xuất sắc") || q.includes("dẫn đầu") || q.includes("thứ hạng") || q.includes("điểm cao")) {
      const topList = await executiveDashboardService.getExecutiveTopMembers(userContext, { year: currentYear, quarter: currentQuarter, branch, sortBy: "overall", limit: 5 });
      if (!topList || topList.length === 0) {
        return `Chưa có dữ liệu xếp hạng thi đua cho Quý ${currentQuarter}/${currentYear} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`}).`;
      }
      let md = `### 🏆 Top 5 Đoàn sinh xuất sắc nhất (Quý ${currentQuarter}/${currentYear} - ${branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`})\n\n`;
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
    if (q.includes("chuyên cần") || q.includes("điểm danh") || q.includes("vắng") || q.includes("xu hướng") || q.includes("buổi sinh hoạt")) {
      const trend = await executiveDashboardService.getExecutiveAttendanceTrend(userContext, { year: currentYear, quarter: currentQuarter, branch });
      if (trend?.history && trend.history.length > 0) {
        let md = `### 📈 Xu hướng Chuyên cần các buổi sinh hoạt gần nhất (${branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`})\n\n`;
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
    if (q.includes("môn học") || q.includes("hệ số") || q.includes("điểm thi") || q.includes("giáo lý") || q.includes("kinh thánh")) {
      const categories = await prisma.gradeCategory.findMany({ where: { active: true } });
      let md = `### 📚 Cấu hình Môn học & Hệ số tính điểm\n\n`;
      md += `| Môn học | Hệ số (Trọng số) |\n`;
      md += `| :--- | :---: |\n`;
      categories.forEach((c) => {
        md += `| **${c.name}** | ${c.weight} |\n`;
      });
      return md;
    }

    // 7. Danh bạ Huynh Trưởng
    if (q.includes("huynh trưởng") || q.includes("bqt") || q.includes("ban quản trị") || q.includes("danh bạ") || q.includes("ai phụ trách")) {
      const users = await prisma.user.findMany({ where: { active: true }, select: { name: true, role: true, branch: true, email: true } });
      let md = `### 👥 Danh bạ Ban Quản Trị & Huynh Trưởng\n\n`;
      md += `| Họ tên | Vai trò | Ngành phụ trách | Email |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      users.forEach((u) => {
        md += `| **${u.name}** | ${u.role === "admin" ? "BQT (Admin)" : "Huynh Trưởng"} | ${u.branch ? `Ngành ${u.branch}` : "Toàn Gia Đình Hưng Đạo"} | \`${u.email}\` |\n`;
      });
      return md;
    }

    // 8. Tóm tắt / Tổng quan Quý
    if (q.includes("tổng quan") || q.includes("tóm tắt") || q.includes("tình hình") || q.includes("báo cáo") || q.includes("quý này") || q.includes("thống kê") || q.includes("bao nhiêu")) {
      const overview = await executiveDashboardService.getExecutiveOverview(userContext, { year: currentYear, quarter: currentQuarter, branch });
      return `### 📊 Báo cáo Tổng quan Quý ${currentQuarter}/${currentYear} (${branch === "all" ? "Toàn Gia Đình Hưng Đạo" : `Ngành ${branch}`})

- **Tổng số Đoàn sinh:** **${overview?.totalMembers?.value || 0}** em (${overview?.totalMembers?.diff >= 0 ? "+" : ""}${overview?.totalMembers?.diff || 0} so với quý trước)
- **Tỷ lệ Chuyên cần trung bình:** **${overview?.attendanceRate?.value || 0}%** (${overview?.attendanceRate?.diff >= 0 ? "+" : ""}${overview?.attendanceRate?.diff || 0}%)
- **Điểm Đánh giá trung bình:** **${(overview?.averageScore?.value || 0).toFixed(1)} / 10** (${overview?.averageScore?.diff >= 0 ? "+" : ""}${overview?.averageScore?.diff || 0})
- **Đoàn sinh cần lưu ý (Cảnh báo):** **${overview?.riskMembers?.value || 0}** em

---
💡 *Bạn có thể hỏi tôi chi tiết hơn như: "Top 5 em điểm cao nhất", "Ai đang vắng nhiều?", "Đoàn sinh ở xã đạo nào nhiều nhất?", "Tìm hồ sơ em Vy", hoặc "So sánh chuyên cần các ngành".*`;
    }

    // 9. Trường hợp không nhận diện được ý định rõ ràng: Trả về bảng hướng dẫn các câu hỏi mẫu
    return `Chào bạn! Tôi là **Trợ lý AI Phân tích Dữ liệu Toàn diện** của Trung Nam Hub.

Tôi có thể hỗ trợ bạn tra cứu mọi thông tin trong hệ thống:
- 📍 **Phân bố & Địa bàn:** *"Đoàn sinh ở xã đạo nào nhiều nhất?"*, *"Thống kê theo Họ Đạo/giới tính"*
- 🔍 **Tra cứu Đoàn sinh:** *"Tìm thông tin em Trúc Vy"*, *"Hồ sơ em Dũng"*
- 🏆 **Thi đua & Điểm số:** *"Top 5 đoàn sinh xuất sắc"*, *"Môn nào điểm trung bình cao nhất?"*
- ⚠️ **Cảnh báo Nguy cơ:** *"Có em nào vắng nhiều không?"*, *"Danh sách đoàn sinh diện cảnh báo"*
- 📈 **Chuyên cần & Buổi học:** *"Chi tiết điểm danh buổi sinh hoạt gần nhất"*, *"Xu hướng chuyên cần"*
- 👥 **Đội ngũ Huynh Trưởng:** *"Danh bạ Huynh trưởng Ngành Thiếu"*, *"Ai phụ trách Ngành Đồng?"*
- 📊 **Báo cáo Tổng quan:** *"Tóm tắt tình hình Quý này"*

Bạn muốn tra cứu thông tin nào?`;
  } catch (err) {
    console.error("Error in generateFallbackResponse:", err);
    return `Xin chào! Tôi là Trợ lý AI Phân tích Dữ liệu của Trung Nam Hub. Bạn có thể hỏi tôi về tình hình chuyên cần, điểm số thi đua, danh sách đoàn sinh xuất sắc hoặc các em thuộc diện cảnh báo trong Quý ${currentQuarter}/${currentYear}.`;
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
    return result?.error ? `Lỗi tra cứu: ${result.error}` : "Đã tra cứu dữ liệu nhưng không tìm thấy thông tin phù hợp.";
  }

  const d = result.data;

  switch (toolName) {
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
      const bdays = d.birthdays || [];
      if (bdays.length === 0) return `Hiện chưa ghi nhận đoàn sinh nào có sinh nhật trong thời gian này (${d.branch}).`;
      let md = `### 🎂 Danh sách Đoàn sinh Sinh nhật (${d.branch})\n\n`;
      md += `| Ngày sinh | Đoàn sinh | Ngành | Chi đoàn/Đội | Xã đạo/Xã đạo | Tuổi mới |\n`;
      md += `| :---: | :--- | :--- | :--- | :--- | :---: |\n`;
      bdays.forEach((b) => {
        md += `| **${b.birthDate}** | **${b.name}** | ${b.branch} | ${b.group} | ${b.parish} | ${b.age ? `${b.age} tuổi` : "—"} |\n`;
      });
      return md;
    }
    default: {
      return `Dưới đây là kết quả tra cứu dữ liệu thực tế từ hệ thống:\n\n` + (d.summaryMessage || JSON.stringify(d, null, 2));
    }
  }
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
      reply: fallbackText,
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

      const secondRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelUsed}:generateContent?key=${GEMINI_API_KEY}`,
        secondTurnPayload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 65000,
        }
      );

      const finalCandidate = secondRes.data?.candidates?.[0];
      const textParts = finalCandidate?.content?.parts?.filter((p) => p.text).map((p) => p.text) || [];
      let reply = textParts.join("\n\n").trim();

      if (!reply) {
        console.warn("⚠️ Gemini returned empty text after tool call. Synthesizing from tool result directly.");
        reply = (lastToolName && lastToolResult)
          ? formatToolResultToMarkdown(lastToolName, lastToolResult)
          : await generateFallbackResponse(trimmedMessage, userContext);
      }

      return {
        reply,
        toolCalled: executedToolNames.join(", "),
        modelUsed,
      };
    }

    // Nếu không cần gọi tool, trả về text trực tiếp
    const textParts = modelParts.filter((p) => p.text).map((p) => p.text) || [];
    let reply = textParts.join("\n\n").trim();

    return {
      reply: reply || (await generateFallbackResponse(trimmedMessage, userContext)),
      modelUsed,
    };
  } catch (err) {
    console.error("Gemini API Error:", err?.response?.data || err.message);
    // Fallback mượt mà nếu Gemini gặp lỗi quota hoặc model name
    const fallbackText = await generateFallbackResponse(trimmedMessage, userContext);
    return {
      reply: fallbackText,
      modelUsed: "local-analyst-fallback (api error)",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. QUICK SUGGESTIONS
// ─────────────────────────────────────────────────────────────────────────────
function getQuickSuggestions(userContext) {
  const isBranchLeader = userContext?.role !== "admin" && userContext?.branch;
  const branchName = userContext?.branch ? `Ngành ${userContext.branch}` : "Ngành";

  if (isBranchLeader) {
    return [
      `Tóm tắt tình hình ${branchName} Quý này`,
      `Kế hoạch chương trình sinh hoạt ${branchName} Quý này`,
      `Top 5 đoàn sinh điểm cao nhất ${branchName}`,
      `Có những em nào trong ${branchName} vắng nhiều?`,
      `Đoàn sinh ở xã đạo nào nhiều nhất?`,
      `Chi tiết điểm danh buổi sinh hoạt gần nhất`,
      `Xem cấu hình hệ số môn học`,
    ];
  }

  return [
    "Tóm tắt tình hình Gia Đình Hưng Đạo Quý này",
    "Tiến độ kế hoạch chương trình sinh hoạt các Ngành",
    "Đoàn sinh ở xã đạo nào nhiều nhất?",
    "So sánh tỷ lệ chuyên cần giữa các Ngành",
    "Danh sách đoàn sinh xuất sắc nhất",
    "Những đoàn sinh thuộc diện cảnh báo nguy cơ",
    "Chi tiết điểm danh buổi sinh hoạt gần nhất",
    "Danh bạ Huynh Trưởng và BQT",
  ];
}

module.exports = {
  processChatMessage,
  getQuickSuggestions,
};