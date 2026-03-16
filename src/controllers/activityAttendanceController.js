const services = require("../services");

async function markAttendanceActivity(req, res, next) {
  try {
    const data = req.body;
    const user = req.user;
    const activity =
      await services.activityAttendanceService.markActivityAttendance(
        user,
        data.activityId,
        data.memberIds,
      );
    res.ok(activity, "Activity attendance marked successfully");
  } catch (err) {
    next(err);
  }
}

async function getActivityAttendance(req, res, next) {
  try {
    const activityId = req.params.activityId;
    const activity = await services.activityAttendanceService.getActivityAttendance(activityId);
    res.ok(activity, "Activity attendance fetched successfully");
  } catch (err) {
    next(err);
  }
}

async function deleteActivityAttendance(req, res, next) {
  try {
    const ids = req.body.ids;
    const activity = await services.activityAttendanceService.deleteActivityAttendance(ids);
    res.ok(activity, "Activity attendance deleted successfully");
  } catch (err) {
    next(err);
  }
}

module.exports = { markAttendanceActivity, getActivityAttendance, deleteActivityAttendance };
