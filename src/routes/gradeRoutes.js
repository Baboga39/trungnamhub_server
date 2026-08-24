// src/routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();
const middlewares = require("../middlewares");
const gradeController = require("../controllers/gradeController");
const { gradeCategorySchema, gradeSchema, upsertGradeSchema } = require("../validations/gradeValidation");

router.get("/all", middlewares.auth, gradeController.getAllGrades);

// Category routes
router.get(
  "/categories",
  middlewares.auth,
  gradeController.getAllGradeCategory
);

router.post(
  "/categories/upsert",
  middlewares.auth,
  middlewares.validation(gradeCategorySchema),
  gradeController.upSertGradeCategory
);

router.post(
  "/upsert",
  middlewares.auth,
  middlewares.validation(gradeCategorySchema),
  gradeController.upSertGradeCategory
);

router.delete(
  "/categories/:id",
  middlewares.auth,
  gradeController.deleteGradeCategory
);

router.post(
  "/categories/delete",
  middlewares.auth,
  gradeController.deleteGradeCategory
);

router.post(
  "/categories/soft-delete",
  middlewares.auth,
  gradeController.softDeleteGradeCategory
);

// Score routes
router.post(
  "/score/upsert",
  middlewares.auth,
  middlewares.validation(upsertGradeSchema),
  gradeController.upSertScore
);

router.post("/score/delete", middlewares.auth, gradeController.deleteScore);

module.exports = router;
