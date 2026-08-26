const axios = require("axios");
const jwt = require("jsonwebtoken");
const executiveDashboardService = require("./executiveDashboardService");
const dashboardService = require("./dashboardService");
const prisma = require("../libs/prisma");

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
    description: "Thống kê cơ cấu, phân bố đoàn sinh theo: Xã đạo/Giáo xứ (parish), Giáo họ/Nhà thờ (church), Giới tính (gender), Phân đoàn/Đội (group), Ngành (branch), hoặc Năm sinh/Độ tuổi (birthYear).",
    parameters: {
      type: "OBJECT",
      properties: {
        groupBy: {
          type: "STRING",
          description: "Trường cần nhóm: 'parish' (xã đạo/giáo xứ), 'church' (giáo họ/nhà thờ), 'gender' (giới tính), 'group' (chi đoàn/đội), 'branch' (ngành), 'birthYear' (năm sinh/độ tuổi)",
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
    description: "Tra cứu danh sách đoàn sinh có sinh nhật trong Quý hoặc Tháng cụ thể (ngày sinh, tháng sinh, tuổi, ngành, chi đoàn, giáo xứ/xã đạo, mừng tuổi mới) của các ngành hoặc toàn Gia Đình Hưng Đạo.",
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
    name: "get_organization_structure",
    description: "Giới thiệu tổng quan cơ cấu tổ chức Xứ Đoàn / Gia Đình Hưng Đạo, các ngành (Đồng, Thiếu, Thanh), độ tuổi, khẩu hiệu, tôn chỉ, mục tiêu dành cho người mới hoặc người ngoài muốn tìm hiểu.",
    parameters: {
      type: "OBJECT",
      properties: {},
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
    description: "Bảng vàng chuỗi chuyên cần (Top đoàn sinh có chuỗi tham gia sinh hoạt liên tục dài nhất hiện tại và kỷ lục dài nhất lịch sử).",
    parameters: {
      type: "OBJECT",
      properties: {
        limit: { type: "INTEGER", description: "Số lượng top đoàn sinh (mặc định 10)" },
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

      // 3. Phân bố nhân khẩu / Xã đạo / Giáo họ / Giới tính
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

      // 15. Cơ cấu tổ chức & tôn chỉ Xứ Đoàn (dành cho người mới tìm hiểu)
      case "get_organization_structure": {
        const [branchCounts, totalMembers, totalLeaders] = await Promise.all([
          prisma.member.groupBy({
            by: ["branch"],
            where: { active: true },
            _count: { id: true },
          }),
          prisma.member.count({ where: { active: true } }),
          prisma.user.count({ where: { active: true } }),
        ]);

        const branchMap = {};
        branchCounts.forEach((b) => {
          if (b.branch) branchMap[b.branch] = b._count.id;
        });

        return {
          success: true,
          data: {
            organizationName: "Gia Đình Hưng Đạo - Thiếu Nhi Thánh Thể",
            coreMission: "Giáo dục đức tin, nhân bản và kỹ năng sống cho thanh thiếu nhi theo tinh thần Phúc Âm và phong trào TNTT.",
            totalActiveMembers: totalMembers,
            totalLeaders: totalLeaders,
            branches: [
              {
                branchName: "Ngành Đồng (Ấu Nhi)",
                ageRange: "7 - 9 tuổi",
                motto: "Vâng Lời",
                description: "Tập trung rèn luyện tính vâng phục, lễ phép, đức tính đơn sơ và sinh hoạt tập thể vui tươi.",
                activeMembers: branchMap["Đồng"] || 0,
              },
              {
                branchName: "Ngành Thiếu (Thiếu Nhi)",
                ageRange: "10 - 15 tuổi",
                motto: "Hy Sinh",
                description: "Rèn luyện tinh thần hy sinh, học hỏi giáo lý chuyên sâu, phát triển kỹ năng lều trại, nút dây, sơ cấp cứu và làm việc nhóm.",
                activeMembers: branchMap["Thiếu"] || 0,
              },
              {
                branchName: "Ngành Thanh (Nghĩa Sĩ / Hiệp Sĩ)",
                ageRange: "16+ tuổi",
                motto: "Chinh Phục / Dấn Thân",
                description: "Định hướng lý tưởng sống, tinh thần phục vụ tha nhân, sẵn sàng trở thành trợ tá và huynh trưởng tương lai.",
                activeMembers: branchMap["Thanh"] || 0,
              },
            ],
            leadershipStructure: "Ban Quản Trị (Xứ Đoàn Trưởng, Xứ Đoàn Phó) phối hợp cùng Trưởng/Phó các Ngành điều hành mọi sinh hoạt và học tập.",
          },
        };
      }

      // 16. Danh bạ liên lạc khẩn cấp phụ huynh
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
        const limit = args.limit ? Number(args.limit) : 10;
        const streaks = await dashboardService.getAttendanceStreakTop(userContext, limit);
        return {
          success: true,
          data: {
            count: streaks.length,
            topStreaks: streaks.map((s, idx) => ({
              rank: idx + 1,
              id: s.id,
              name: s.fullName,
              parish: s.parish || "—",
              currentStreak: s.currentStreak,
              longestStreak: s.longestStreak,
            })),
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

Nhiệm vụ và khả năng của bạn:
1. Bạn có đầy đủ 26 công cụ (Tools) chuyên sâu để tra cứu mọi dữ liệu thực tế từ hệ thống:
   - 📊 Tổng quan điều hành (Sĩ số, Chuyên cần, Điểm số, Cảnh báo): \`get_executive_overview\`
   - ⚖️ So sánh thi đua giữa các ngành: \`get_branch_performance\`
   - 📍 Phân bố nhân khẩu (Xã đạo, Giáo xứ, Giáo họ, Giới tính, Độ tuổi): \`get_member_demographics\`
   - 🔍 Tra cứu hồ sơ & điểm số chi tiết từng đoàn sinh: \`search_member_profile\`
   - 🏆 Top đoàn sinh xuất sắc (Điểm số, Chuyên cần, Hoạt động): \`get_top_members\`
   - ⚠️ Danh sách đoàn sinh diện cảnh báo nguy cơ: \`get_risk_members\`
   - 📈 Xu hướng chuyên cần theo buổi: \`get_attendance_trend\`
   - 📝 Chi tiết điểm danh từng buổi sinh hoạt (ai vắng, có phép/không phép): \`get_session_attendance_details\`
   - 📚 Phân tích điểm theo từng Môn học & Hệ số: \`get_subject_grades_analytics\`
   - ⛺ Hoạt động ngoại khóa & sự kiện phong trào: \`get_activities_summary\`
   - 📖 Kế hoạch giáo lý quý & bài học: \`get_quarter_programs\`
   - 👥 Danh bạ Huynh Trưởng & BQT: \`get_leaders_directory\`
   - 📄 Tài liệu, tờ trình & phê duyệt: \`get_documents_and_approvals\`
   - 🎂 Danh sách sinh nhật đoàn sinh theo Quý/Tháng: \`get_quarterly_birthdays\`

2. Phong cách trả lời:
   - Trả lời bằng tiếng Việt tự nhiên, chuyên nghiệp, đúng trọng tâm câu hỏi.
   - Định dạng Markdown đẹp mắt: sử dụng bảng biểu (\`| Header | ...\`), danh sách (\`-\`), in đậm (\`**số liệu**\`), biểu tượng cảm xúc (emoji).
   - Thời gian hiện tại: Quý ${currentQuarter}/${currentYear}.
   - Không bịa đặt số liệu. Luôn gọi tool phù hợp để lấy dữ liệu thực tế.
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
      md += `| Ngày sinh | Đoàn sinh | Ngành | Chi đoàn/Đội | Giáo xứ/Xã đạo | Tuổi mới |\n`;
      md += `| :---: | :--- | :--- | :--- | :--- | :---: |\n`;
      members.forEach((m) => {
        md += `| **${m.formattedDate}** | **${m.fullName}** | ${m.branch ? `Ngành ${m.branch}` : "—"} | ${m.group || "—"} | ${m.parish || "—"} | ${m.age ? `${m.age} tuổi` : "—"} |\n`;
      });
      return md;
    }

    // 1. Phân bố Xã đạo / Giáo họ / Địa bàn / Giới tính
    if (q.includes("xã đạo") || q.includes("giáo xứ") || q.includes("giáo họ") || q.includes("nhà thờ") || q.includes("địa bàn") || q.includes("phân bố") || q.includes("giới tính") || q.includes("ở đâu")) {
      const groupBy = (q.includes("giáo họ") || q.includes("nhà thờ")) ? "church" : (q.includes("giới tính") || q.includes("nam") || q.includes("nữ")) ? "gender" : "parish";
      const groupTitle = groupBy === "church" ? "Giáo họ / Nhà thờ" : groupBy === "gender" ? "Giới tính" : "Xã đạo / Giáo xứ";

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
        md += `- **Xã đạo:** ${m.parish || "—"} | **Giáo họ:** ${m.church || "—"}\n`;
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
- 📍 **Phân bố & Địa bàn:** *"Đoàn sinh ở xã đạo nào nhiều nhất?"*, *"Thống kê theo giáo họ/giới tính"*
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
// 6. MAIN CHAT PROCESSING FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
async function processChatMessage({ message, history = [], userContext }) {
  if (!message || typeof message !== "string" || !message.trim()) {
    throw new Error("Tin nhắn không được để trống");
  }

  const trimmedMessage = message.trim();

  // Nếu không có API Key, dùng bộ phân tích thông minh Deterministic Fallback
  if (!GEMINI_API_KEY) {
    console.log("ℹ️ GEMINI_API_KEY chưa cấu hình, sử dụng Smart Analytic Fallback");
    const fallbackText = await generateFallbackResponse(trimmedMessage, userContext);
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

    // Add current user prompt
    formattedContents.push({
      role: "user",
      parts: [{ text: trimmedMessage }],
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

      for (const part of functionCallParts) {
        const call = part.functionCall;
        console.log(`🤖 Gemini (${modelUsed}) requesting tool call: ${call.name} with args:`, call.args);
        executedToolNames.push(call.name);

        const toolResult = await executeTool(call.name, call.args, userContext);
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
        console.warn("⚠️ Gemini returned empty text after tool call. Falling back to structured response.");
        reply = await generateFallbackResponse(trimmedMessage, userContext);
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