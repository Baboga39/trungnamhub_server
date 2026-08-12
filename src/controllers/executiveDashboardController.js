// src/controllers/executiveDashboardController.js
const { executiveDashboardService } = require("../services");

async function getOverview(req, res, next) {
  try {
    const { year, quarter, branch } = req.query;
    const result = await executiveDashboardService.getExecutiveOverview(req.user, { year, quarter, branch });
    return res.ok(result, "Get executive overview success");
  } catch (err) {
    next(err);
  }
}

async function getBranchPerformance(req, res, next) {
  try {
    const { year, quarter } = req.query;
    const result = await executiveDashboardService.getExecutiveBranchPerformance(req.user, { year, quarter });
    return res.ok(result, "Get executive branch performance success");
  } catch (err) {
    next(err);
  }
}

async function getTopMembers(req, res, next) {
  try {
    const { year, quarter, branch, sortBy, limit } = req.query;
    const result = await executiveDashboardService.getExecutiveTopMembers(req.user, { year, quarter, branch, sortBy, limit });
    return res.ok(result, "Get executive top members success");
  } catch (err) {
    next(err);
  }
}

async function getAttendanceTrend(req, res, next) {
  try {
    const { year, quarter, branch } = req.query;
    const result = await executiveDashboardService.getExecutiveAttendanceTrend(req.user, { year, quarter, branch });
    return res.ok(result, "Get executive attendance trend success");
  } catch (err) {
    next(err);
  }
}

async function getActivities(req, res, next) {
  try {
    const { year, quarter, branch } = req.query;
    const result = await executiveDashboardService.getExecutiveActivities(req.user, { year, quarter, branch });
    return res.ok(result, "Get executive activities success");
  } catch (err) {
    next(err);
  }
}

async function getRisks(req, res, next) {
  try {
    const { year, quarter, branch } = req.query;
    const result = await executiveDashboardService.getExecutiveRiskMembers(req.user, { year, quarter, branch });
    return res.ok(result, "Get executive risks success");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOverview,
  getBranchPerformance,
  getTopMembers,
  getAttendanceTrend,
  getActivities,
  getRisks,
};
