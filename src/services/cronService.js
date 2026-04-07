// src/services/cronService.js
// Cron Job với timezone Asia/Ho_Chi_Minh (GMT+7) cho server Singapore

const cron = require("node-cron");
const prisma = require("../libs/prisma");

// Map lưu các task đang chạy trong RAM: id -> task
const activeTasks = new Map();

// Tính Quý hiện tại theo giờ Việt Nam
function getCurrentVNQuarter() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const month = now.getMonth() + 1; // 1-12
  return Math.ceil(month / 3); // Q1: 1-3, Q2: 4-6, Q3: 7-9, Q4: 10-12
}

function getCurrentVNYear() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  return now.getFullYear();
}

// Giải quyết tham số động: "auto" -> tính tự động
function resolveParameters(rawParameters) {
  const quarter = getCurrentVNQuarter();
  const year = getCurrentVNYear();

  const resolved = { ...rawParameters };

  if (!resolved.year || resolved.year === "auto") resolved.year = year;
  if (!resolved.quarter || resolved.quarter === "auto") resolved.quarter = quarter;

  return resolved;
}

// Chạy một schedule
async function runSchedule(schedule) {
  try {
    console.log(`⏰ [CronService] Chạy báo cáo tự động: "${schedule.name}" (${schedule.templateId})`);

    // Cập nhật thời gian chạy cuối
    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: new Date() },
    });

    // Resolve tham số động
    const parameters = resolveParameters(schedule.parameters || {});
    const emails = schedule.emails || [];

    if (!emails || emails.length === 0) {
      console.warn(`⚠️ [CronService] Schedule "${schedule.name}" không có email nhận. Bỏ qua.`);
      return;
    }

    // Import reportRegistry từ reports/index.js
    const { reportRegistry } = require("../reports");
    const handler = reportRegistry[schedule.templateId];

    if (!handler) {
      console.error(`❌ [CronService] Không tìm thấy handler cho templateId: ${schedule.templateId}`);
      return;
    }

    // Tạo fake res object để handler có thể gọi res.ok / res.status()
    const fakeRes = {
      ok: (data, msg) => console.log(`✅ [CronService] "${schedule.name}" hoàn tất: ${msg}`),
      status: (code) => ({
        json: (body) => console.error(`❌ [CronService] "${schedule.name}" lỗi ${code}: ${body.message}`),
      }),
    };

    // Với mỗi email, chạy báo cáo
    for (const email of emails) {
      await handler({ ...parameters, email }, fakeRes);
    }
  } catch (err) {
    console.error(`❌ [CronService] Lỗi khi chạy schedule "${schedule.name}":`, err.message);
  }
}

// Đăng ký một schedule vào RAM
function registerTask(schedule) {
  // Hủy task cũ nếu có
  if (activeTasks.has(schedule.id)) {
    activeTasks.get(schedule.id).stop();
    activeTasks.delete(schedule.id);
  }

  if (!schedule.active) return;

  if (!cron.validate(schedule.cronExpression)) {
    console.warn(`⚠️ [CronService] Cron expression không hợp lệ: "${schedule.cronExpression}" (schedule: ${schedule.name})`);
    return;
  }

  const task = cron.schedule(
    schedule.cronExpression,
    () => runSchedule(schedule),
    { timezone: "Asia/Ho_Chi_Minh" }
  );

  activeTasks.set(schedule.id, task);
  console.log(`✅ [CronService] Đã đăng ký: "${schedule.name}" | Cron: ${schedule.cronExpression}`);
}

// Khởi động tất cả schedules từ DB
async function initSchedules() {
  try {
    const schedules = await prisma.reportSchedule.findMany({ where: { active: true } });
    console.log(`⏰ [CronService] Khởi động ${schedules.length} lịch báo cáo tự động...`);
    schedules.forEach(registerTask);
  } catch (err) {
    console.error("❌ [CronService] Lỗi khởi động schedules:", err.message);
  }
}

// Reload lại một schedule cụ thể (sau khi update trên UI)
function reloadSchedule(schedule) {
  registerTask(schedule);
}

// Tắt một schedule
function stopSchedule(id) {
  if (activeTasks.has(id)) {
    activeTasks.get(id).stop();
    activeTasks.delete(id);
  }
}

module.exports = {
  initSchedules,
  reloadSchedule,
  stopSchedule,
};
