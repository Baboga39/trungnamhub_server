// src/routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();
const middlewares = require("../middlewares");
const controller = require("../controllers")
const { activitySchema } = require("../validations/activityValidation");

router.post(
  "/upsert",
  middlewares.auth, 
  middlewares.validation(activitySchema),
  controller.activityController.upsertActivity
);

router.get(
  "/all",
  middlewares.auth,
  controller.activityController.getActivities
);

module.exports = router;
