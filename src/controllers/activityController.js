const services = require("../services");

async function upsertActivity(req, res, next) {
  try {
    const data = req.body;
    const user = req.user;
    const activity = await services.activityService.upSertActivity(data, user);
    res.ok(activity, "Activity upserted successfully");
  } catch (err) {
    next(err);
  }
}

async function getActivities(req, res, next) {
  try {
    const activities = await services.activityService.getActivities();
    res.ok(activities, "Activities fetched successfully");
  } catch (err) {
    next(err);
  }
}

module.exports = { upsertActivity , getActivities };