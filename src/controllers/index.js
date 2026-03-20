const userController = require("./user.controller");
const memberController = require("./member.controller");
const authController = require("./authController");
const attendanceController = require("./attendanceController");
const gradeController = require("./gradeController");
const activityController = require("./activityController");
const activityAttendanceController = require("./activityAttendanceController");
const reportController = require("./reportController");

module.exports = {
  userController,
  memberController,
  authController,
  attendanceController,
  gradeController,
  activityController,
  activityAttendanceController,
  reportController,
};
