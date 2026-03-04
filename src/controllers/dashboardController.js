// src/controllers/authController.js
const { get } = require("http");
const services = require("../services");

async function getDashboardStats(req, res, next) {
  try {
    const result = await services.dashboardService.getDashboardStats();
    return res.ok(result, "Get dashboard stats success");
  } catch (err) {
    next(err);
  }
}

async function getTop3MembersByScoreThisYear(req, res, next) {
  try {
    const result = await services.gradeService.getTop3MembersByScoreThisYear();
    return res.ok(result, "Get top 3 members by score this year success");
  } catch (err) {
    next(err);
  }
}

async function getRankingThisYear(req,res,next) {
  try {
    const result = await services.gradeService.getRankingThisYear();
    return res.ok(result, "Get ranking this year success");
  } catch (err) {
    next(err);
  }
}
async function getGradeTrendTimeline(req,res,next) {
  try {
    const result = await services.gradeService.getGradeTrendTimeline(); 
    return res.ok(result, "Get grade trend timeline success");
  } catch (err) {
    next(err);
  }
}
async function getAttendanceStreakTop(req,res,next) {
  try {
    const result = await services.sessionService.getAttendanceStreakTop();
    return res.ok(result, "Get attendance streak top success");
  } catch (err) {
    next(err);
  }
}
async function getRiskMembers(req,res,next) {
  try {
    const result = await services.dashboardService.getRiskMembers();
    return res.ok(result, "Get risk members success");
  } catch (err) {
    next(err);
  }
}

async function getAttendanceStreakTop(req,res,next) {
  try {
    const result = await services.dashboardService.getAttendanceStreakTop();
    return res.ok(result, "Get attendance streak top success");
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboardStats, getTop3MembersByScoreThisYear, getRankingThisYear, getGradeTrendTimeline, getAttendanceStreakTop, 
  getRiskMembers,getRiskMembers, getAttendanceStreakTop };