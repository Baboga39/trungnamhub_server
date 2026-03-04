const service = require("../services");

async function getAllGrades(req, res, next) {
  try {
    const grade = await service.gradeService.getAllGrades();
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
    const { id } = req.params;
    const deletedGradeCategory =
    await service.gradeService.softDeleteGradeCategory(id);
    res.ok(deletedGradeCategory, "Grade category deleted successfully");
  } catch (err) {
    next(err);
  }
}

async function getAllGradeCategory(req, res, next) {
  try {
    const gradeCategory = await service.gradeService.getAllGradeCategory();
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

module.exports = {
  getAllGrades,
  softDeleteGradeCategory,
  upSertGradeCategory,
  getAllGradeCategory,
  upSertScore
};
