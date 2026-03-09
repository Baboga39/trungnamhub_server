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

module.exports = { markAttendanceActivity };
