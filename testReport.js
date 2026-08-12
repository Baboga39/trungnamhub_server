const { generateMemberReportPDF } = require("./src/services/reportService");

(async () => {
  try {
    const filePath = await generateMemberReportPDF(107, 2026, 1,"ngochai06122002@gmail.com");
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();