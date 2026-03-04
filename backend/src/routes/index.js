const userRoutes = require("./user.routes");
const memberRoutes = require("./member.routes");
const authRoutes = require("./authRoutes");
const attendanceRoutes = require("./attendance.routes");
const gradeRoutes = require("./gradeRoutes");
const dashboardRoutes = require("./dashboard.routes");

module.exports = (app) => {
  // User
  app.use("/api/v1/users", userRoutes);

  app.use("/api/v1/members", memberRoutes);

  app.use("/api/v1/auth", authRoutes);

  app.use("/api/v1/attendance", attendanceRoutes);

  app.use("/api/v1/grades", gradeRoutes);

  app.use("/api/v1/dashboard", dashboardRoutes);
};
