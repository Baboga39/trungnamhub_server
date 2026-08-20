const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const middlewares = require("../middlewares");

const executiveDashboardController = require("../controllers/executiveDashboardController");

// Existing endpoints
router.get("/stats", middlewares.auth, dashboardController.getDashboardStats);
router.get("/top3-members", middlewares.auth, dashboardController.getTop3MembersByScoreThisYear);
router.get("/ranking", middlewares.auth, dashboardController.getRankingThisYear);
router.get("/grade-trend-timeline", middlewares.auth, dashboardController.getGradeTrendTimeline);
router.get("/attendance-streak-top", middlewares.auth, dashboardController.getAttendanceStreakTop);
router.get("/risk-members", middlewares.auth, dashboardController.getRiskMembers);
router.get("/quarterly-birthdays", middlewares.auth, dashboardController.getQuarterlyBirthdays);


// Executive Dashboard Endpoints (Cockpit for Quý Trưởng Đoàn)
router.get("/executive/overview", middlewares.auth, executiveDashboardController.getOverview);
router.get("/executive/branches", middlewares.auth, executiveDashboardController.getBranchPerformance);
router.get("/executive/top-members", middlewares.auth, executiveDashboardController.getTopMembers);
router.get("/executive/attendance-trend", middlewares.auth, executiveDashboardController.getAttendanceTrend);
router.get("/executive/activities", middlewares.auth, executiveDashboardController.getActivities);
router.get("/executive/risks", middlewares.auth, executiveDashboardController.getRisks);

// Public Executive Dashboard Endpoints (No Auth required for public viewers)
router.get("/executive/public/overview", executiveDashboardController.getPublicOverview);
router.get("/executive/public/branches", executiveDashboardController.getPublicBranchPerformance);
router.get("/executive/public/top-members", executiveDashboardController.getPublicTopMembers);
router.get("/executive/public/attendance-trend", executiveDashboardController.getPublicAttendanceTrend);
router.get("/executive/public/activities", executiveDashboardController.getPublicActivities);
router.get("/executive/public/risks", executiveDashboardController.getPublicRisks);

module.exports = router;
