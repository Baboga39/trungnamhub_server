// src/controllers/attendanceController.js
const services = require("../services");

async function markAttendance(req, res, next) {
  try {
    const user = req.user;
    const { records } = req.body;

    const result = await services.attendanceService.markAttendance(user, records);
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

async function getAttendanceAll(req, res, next) {
  try {
    const data = await services.attendanceService.getAttendanceAll();
    return res.ok(data, "Attendance fetched successfully");
  } catch (err) {
    next(err);
  }  
}

async function getAttendanceByMember(req, res, next) {
  try {
    const { memberId } = req.params;
    const data = await services.attendanceService.getAttendanceByMember(memberId);
    return res.ok(data, "Member attendance history fetched successfully");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  markAttendance,
  getAttendanceByDate,
  getAttendanceByMember,
  getAttendanceAll
};
