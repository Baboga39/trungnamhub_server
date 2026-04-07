const { reportRegistry, reportConfigs } = require("../reports");
const prisma = require("../libs/prisma");
const { reloadSchedule, stopSchedule } = require("../services/cronService");

const getReportTemplates = async (req, res, next) => {
  try {
    return res.ok(reportConfigs, "Lấy danh sách các mẫu báo cáo thành công");
  } catch (err) {
    next(err);
  }
};

const executeReport = async (req, res, next) => {
  try {
    const { templateId, parameters } = req.body;

    const handler = reportRegistry[templateId];
    if (!handler) {
      return res.status(400).json({ message: "Không tìm thấy báo cáo: " + templateId });
    }

    return await handler(parameters, res);
  } catch (err) {
    next(err);
  }
};

// ─── Schedule CRUD ────────────────────────────────────────────────────────────

const getSchedules = async (req, res, next) => {
  try {
    const schedules = await prisma.reportSchedule.findMany({
      orderBy: { createdAt: "desc" },
    });
    return res.ok(schedules, "Lấy danh sách lịch chạy thành công");
  } catch (err) {
    next(err);
  }
};

const createSchedule = async (req, res, next) => {
  try {
    const { name, templateId, cronExpression, emails, parameters, active } = req.body;
    const schedule = await prisma.reportSchedule.create({
      data: { name, templateId, cronExpression, emails, parameters: parameters || {}, active: active ?? true },
    });
    // Đăng ký ngay vào RAM
    reloadSchedule(schedule);
    return res.ok(schedule, "Tạo lịch tự động thành công");
  } catch (err) {
    next(err);
  }
};

const updateSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, templateId, cronExpression, emails, parameters, active } = req.body;
    const schedule = await prisma.reportSchedule.update({
      where: { id: Number(id) },
      data: { name, templateId, cronExpression, emails, parameters: parameters || {}, active: active ?? true },
    });
    // Reload trong RAM (xử lý cả on/off)
    if (schedule.active) {
      reloadSchedule(schedule);
    } else {
      stopSchedule(schedule.id);
    }
    return res.ok(schedule, "Cập nhật lịch tự động thành công");
  } catch (err) {
    next(err);
  }
};

const deleteSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    stopSchedule(Number(id));
    await prisma.reportSchedule.delete({ where: { id: Number(id) } });
    return res.ok(null, "Đã xóa lịch tự động");
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getReportTemplates,
  executeReport,
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
};