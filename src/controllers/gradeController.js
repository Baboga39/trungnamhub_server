const service = require("../services");

async function getAllGrades(req, res, next) {
  try {
    const grade = await service.gradeService.getAllGrades(req.user);
    res.ok(grade, "Fetched grades successfully");
  } catch (err) {
    next(err);
  }
}

async function upSertGradeCategory(req, res, next) {
  try {
    const data = req.body;
    const user = req.user;
    const gradeCategory = await service.gradeService.upSertGradeCategory(data, user);
    res.ok(gradeCategory, "Successfully");
  } catch (err) {
    next(err);
  }
}

async function softDeleteGradeCategory(req, res, next) {
  try {
    const id = req.params.id || req.body.id;
    const deletedGradeCategory =
      await service.gradeService.softDeleteGradeCategory(id);
    res.ok(deletedGradeCategory, "Grade category deleted successfully");
  } catch (err) {
    next(err);
  }
}

async function deleteGradeCategory(req, res, next) {
  try {
    const id = req.params.id || req.body.id;
    const result = await service.gradeService.deleteGradeCategory(id);
    res.ok(result, "Grade category deleted successfully");
  } catch (err) {
    next(err);
  }
}

async function getAllGradeCategory(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const gradeCategory = await service.gradeService.getAllGradeCategory(includeInactive);
    res.ok(gradeCategory, "Fetched grade category successfully");
  } catch (err) {
    next(err);
  }
}
async function upSertScore(req, res, next) {
  try {
    const data = req.body;
    const score = await service.gradeService.upSertScore(data);
    res.ok(score, "Successfully");
  } catch (err) {
    next(err);
  }
}

async function deleteScore(req, res, next) {
  try {
    const { memberId, year, quarter } = req.body;
    const result = await service.gradeService.deleteScore({ memberId, year, quarter });
    res.ok(result, "Deleted score successfully");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllGrades,
  softDeleteGradeCategory,
  deleteGradeCategory,
  upSertGradeCategory,
  getAllGradeCategory,
  upSertScore,
  deleteScore,
};
