// src/controllers/dashboardController.js
const services = require("../services");

async function getDashboardStats(req, res, next) {
  try {
    const result = await services.dashboardService.getDashboardStats(req.user);
    return res.ok(result, "Get dashboard stats success");
  } catch (err) {
    next(err);
  }
}

async function getTop3MembersByScoreThisYear(req, res, next) {
  try {
    const { quarter, year } = req.query;
    const result = await services.gradeService.getTop3MembersByScoreThisYear(req.user, quarter, year);
    return res.ok(result, "Get top 3 members by score success");
  } catch (err) {
    next(err);
  }
}


async function getRankingThisYear(req, res, next) {
  try {
    const result = await services.gradeService.getRankingThisYear(req.user);
    return res.ok(result, "Get ranking this year success");
  } catch (err) {
    next(err);
  }
}

async function getGradeTrendTimeline(req, res, next) {
  try {
    const result = await services.gradeService.getGradeTrendTimeline(req.user);
    return res.ok(result, "Get grade trend timeline success");
  } catch (err) {
    next(err);
  }
}

async function getAttendanceStreakTop(req, res, next) {
  try {
    const result = await services.dashboardService.getAttendanceStreakTop(req.user);
    return res.ok(result, "Get attendance streak top success");
  } catch (err) {
    next(err);
  }
}

async function getRiskMembers(req, res, next) {
  try {
    const result = await services.dashboardService.getRiskMembers(req.user);
    return res.ok(result, "Get risk members success");
  } catch (err) {
    next(err);
  }
}

async function getQuarterlyBirthdays(req, res, next) {
  try {
    const { quarter, year } = req.query;
    const result = await services.dashboardService.getQuarterlyBirthdays(req.user, quarter, year);
    return res.ok(result, "Get quarterly birthdays success");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboardStats,
  getTop3MembersByScoreThisYear,
  getRankingThisYear,
  getGradeTrendTimeline,
  getAttendanceStreakTop,
  getRiskMembers,
  getQuarterlyBirthdays,
};