// src/controllers/attendanceController.js
const services = require("../services");

async function markAttendance(req, res, next) {
  try {
    const user = req.user;
    const { records } = req.body;

    const result = await services.attendanceService.markAttendance(
      user,
      records,
    );
    return res.ok(result, "Attendance marked successfully");
  } catch (err) {
    next(err);
  }
}

async function getAttendanceByDate(req, res, next) {
  try {
    const { date } = req.params;

    const data = await services.attendanceService.getAttendanceByDate(date);
    return res.ok(data, "Attendance fetched successfully");
  } catch (err) {
    next(err);
  }
}
async function getAttendanceSummary(req, res, next) {
  try {
    const { date, sessionId } = req.params;

    const result = await services.attendanceService.getAttendanceSummary(
      date,
      sessionId
    );

    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function getAttendanceAll(req, res, next) {
  try {
    const user = req.user;
    const data = await services.attendanceService.getAttendanceAll(user);
    return res.ok(data, "Attendance fetched successfully");
  } catch (err) {
    next(err);
  }
}

async function getAttendanceByMember(req, res, next) {
  try {
    const { memberId } = req.params;
    const data =
      await services.attendanceService.getAttendanceByMember(memberId);
    return res.ok(data, "Member attendance history fetched successfully");
  } catch (err) {
    next(err);
  }
}

async function ensureSession(req, res, next) {
  try {
    const { date, branch, userId } = req.body;

    if (!date) {
      return res.status(400).json({
        message: "Date is required",
      });
    }

    const session = await services.sessionService.ensureSession(
      new Date(date),
      userId || req.user?.id || 1,
      branch || null
    );

    return res.status(200).json({
      data: session,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  markAttendance,
  getAttendanceByDate,
  getAttendanceByMember,
  getAttendanceAll,
  ensureSession,
  getAttendanceSummary,
};
