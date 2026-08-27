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
  "/summary/:date/:sessionId",
  middlewares.auth,
  attendanceController.getAttendanceSummary
);

router.get(
  "/member/:memberId",
  middlewares.auth,
  attendanceController.getAttendanceByMember
);
router.post(
  "/ensure-session",
  middlewares.auth,
  attendanceController.ensureSession
);

router.get(
  "/find-session",
  middlewares.auth,
  attendanceController.findSession
);

router.get(
  "/all",
  middlewares.auth,
  attendanceController.getAttendanceAll
);

module.exports = router;
