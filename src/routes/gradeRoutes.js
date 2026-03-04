// src/routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();
const middlewares = require("../middlewares");
const gradeController = require("../controllers/gradeController");
const { gradeCategorySchema, gradeSchema, upsertGradeSchema } = require("../validations/gradeValidation");

router.get("/all", middlewares.auth, gradeController.getAllGrades);

router.post(
  "/upsert",
  middlewares.auth,
  middlewares.validation(gradeCategorySchema),
  gradeController.upSertGradeCategory
);

router.get(
  "/categories",
  middlewares.auth,
  gradeController.getAllGradeCategory
);

router.post("/score/upsert", middlewares.auth,
  middlewares.validation(upsertGradeSchema), gradeController.upSertScore);

module.exports = router;
