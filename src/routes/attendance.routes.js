// src/routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");
const middlewares = require("../middlewares");
const { attendanceMarkSchema } = require("../validations/attendence.validation");

router.post(
  "/mark",
  middlewares.auth, 
  middlewares.validation(attendanceMarkSchema),
  attendanceController.markAttendance
);

router.get(
  "/date/:date",
  middlewares.auth,
  attendanceController.getAttendanceByDate
);

router.get(
  "/member/:memberId",
  middlewares.auth,
  attendanceController.getAttendanceByMember
);

router.get(
  "/all",
  middlewares.auth,
  attendanceController.getAttendanceAll
);

module.exports = router;
