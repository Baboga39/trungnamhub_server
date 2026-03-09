const userService = require("./user.service");
const memberService = require("./member.service");
const authService = require("./authService");
const attendanceService = require("./attendanceService");
const gradeService = require("./gradeService");
const sessionService = require("./sessionService");
const dashboardService = require("./dashboardService");
const activityService = require("./activityService");
const activityAttendanceService = require("./activityAttendanceService");

module.exports = {
  userService,
  memberService,
  authService,
  attendanceService,
  gradeService,
  sessionService,
  dashboardService,
  activityService,
  activityAttendanceService,
};
