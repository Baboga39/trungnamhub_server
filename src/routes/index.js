const userRoutes = require("./user.routes");
const memberRoutes = require("./member.routes");
const authRoutes = require("./authRoutes");
const attendanceRoutes = require("./attendance.routes");
const gradeRoutes = require("./gradeRoutes");
const dashboardRoutes = require("./dashboard.routes");
const activitiesRoutes = require("./activitiesRoutes");
const activityAttendanceRoutes = require("./activityAttendanceRoutes");
const reportRoutes = require("./reportRoutes"); 
const documentRoutes = require("./documentRoute")

module.exports = (app) => {
  // User
  app.use("/api/v1/users", userRoutes);

  app.use("/api/v1/members", memberRoutes);

  app.use("/api/v1/auth", authRoutes);

  app.use("/api/v1/attendance", attendanceRoutes);

  app.use("/api/v1/grades", gradeRoutes);

  app.use("/api/v1/dashboard", dashboardRoutes);

  app.use("/api/v1/activities", activitiesRoutes);

  app.use("/api/v1/activity-attendance", activityAttendanceRoutes);

  app.use("/api/v1/reports", reportRoutes);

  app.use("/api/v1/documents", documentRoutes);
};
