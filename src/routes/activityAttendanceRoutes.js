// src/routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();
const middlewares = require("../middlewares");
const controller = require("../controllers")

router.post(
  "/mark-attendance",
  middlewares.auth, 
  controller.activityAttendanceController.markAttendanceActivity
);

router.get(
  "/:activityId/attendance",
  middlewares.auth, 
  controller.activityAttendanceController.getActivityAttendance
);

router.delete(
  "/delete-attendance",
  middlewares.auth, 
  controller.activityAttendanceController.deleteActivityAttendance
);


module.exports = router;
