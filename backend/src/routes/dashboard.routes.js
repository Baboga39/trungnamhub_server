const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");


router.get("/stats", dashboardController.getDashboardStats);
router.get("/top3-members", dashboardController.getTop3MembersByScoreThisYear);
router.get("/ranking", dashboardController.getRankingThisYear);
router.get("/grade-trend-timeline", dashboardController.getGradeTrendTimeline);
router.get("/attendance-streak-top", dashboardController.getAttendanceStreakTop);
router.get("/risk-members", dashboardController.getRiskMembers);
router.get("/attendance-streak-top", dashboardController.getAttendanceStreakTop);

module.exports = router;
