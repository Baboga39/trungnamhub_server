const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const middlewares = require("../middlewares");

router.get("/stats", middlewares.auth, dashboardController.getDashboardStats);
router.get("/top3-members", middlewares.auth, dashboardController.getTop3MembersByScoreThisYear);
router.get("/ranking", middlewares.auth, dashboardController.getRankingThisYear);
router.get("/grade-trend-timeline", middlewares.auth, dashboardController.getGradeTrendTimeline);
router.get("/attendance-streak-top", middlewares.auth, dashboardController.getAttendanceStreakTop);
router.get("/risk-members", middlewares.auth, dashboardController.getRiskMembers);

module.exports = router;
