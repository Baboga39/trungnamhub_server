const service = require("../services");

const generateMemberReport = async (req, res, next) => {
  try {
    const { memberId, year, quarter, email } = req.body;
    await service.reportService.exportBatchPDF(memberId, year, quarter, email);
    return res.ok(null, "Report generated and sent successfully");

  } catch (err) {
    next(err);
  }
};

const generateAllMemberReport = async (req, res, next) => {
  try {
    const {  year, quarter, email } = req.body;
    await service.reportService.exportBatchAllPDF(year, quarter, email);
    return res.ok(null, "Report generated and sent successfully");

  } catch (err) {
    next(err);
  }
};

module.exports = {
  generateMemberReport,
  generateAllMemberReport
};