// src/routes/reportRoutes.js
const express = require("express");
const router = express.Router();
const middlewares = require("../middlewares");
const controller = require("../controllers");

router.get(
  "/templates",
  middlewares.auth,
  controller.reportController.getReportTemplates
);

router.post(
  "/execute",
  middlewares.auth,
  controller.reportController.executeReport
);

// Schedule endpoints
router.get("/schedules", middlewares.auth, controller.reportController.getSchedules);
router.post("/schedules", middlewares.auth, controller.reportController.createSchedule);
router.put("/schedules/:id", middlewares.auth, controller.reportController.updateSchedule);
router.delete("/schedules/:id", middlewares.auth, controller.reportController.deleteSchedule);

module.exports = router;
