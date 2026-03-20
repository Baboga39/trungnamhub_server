// src/routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();
const middlewares = require("../middlewares");
const controller = require("../controllers")
const { activitySchema } = require("../validations/activityValidation");

router.post(
  "/member",
  middlewares.auth, 
  controller.reportController.generateMemberReport
);

router.post(
  "/all-member",
  middlewares.auth, 
  controller.reportController.generateAllMemberReport
);



module.exports = router;
