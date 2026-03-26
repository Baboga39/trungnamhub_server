const userService = require("./user.service");
const memberService = require("./member.service");
const authService = require("./authService");
const attendanceService = require("./attendanceService");
const gradeService = require("./gradeService");
const sessionService = require("./sessionService");
const dashboardService = require("./dashboardService");
const activityService = require("./activityService");
const activityAttendanceService = require("./activityAttendanceService");
const reportService = require("./reportService"); 
const mailService = require("./mailService/mailService");
const approvalTokenService = require("./approvalTokenService");
const documentService = require("./documentService");
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
  reportService,
  mailService,
  approvalTokenService,
  documentService,
};
