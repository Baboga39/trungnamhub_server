const services = require("../services");
const { asyncHandler } = require("../middlewares");

const upsertActivity = asyncHandler(async (req, res) => {
  const data = req.body;
  const user = req.user;
  const activity = await services.activityService.upSertActivity(data, user);
  res.ok(activity, "Activity upserted successfully");
});

const getActivities = asyncHandler(async (req, res) => {
  const activities = await services.activityService.getActivities();
  res.ok(activities, "Activities fetched successfully");
});

const deleteActivity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deletedActivity = await services.activityService.deleteActivity(id);
  res.ok(deletedActivity, "Activity deleted successfully");
});

module.exports = { upsertActivity, getActivities, deleteActivity };