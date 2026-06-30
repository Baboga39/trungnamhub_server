const service = require("./src/services");
const archiver = require("archiver");

const createZipBuffer = async (files) => {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const buffers = [];

    archive.on("data", (data) => buffers.push(data));
    archive.on("end", () => resolve(Buffer.concat(buffers)));
    archive.on("error", (err) => reject(err));

    for (const file of files) {
      archive.append(file.buffer, { name: file.filename });
    }
    archive.finalize();
  });
};

(async () => {
  try {
    const files = await service.reportService.exportBatchAllPDF(2026, 1, "ngochai06122002@gmail.com");
    console.log("✅ All reports generated, count:", files.length);
    const zipBuffer = await createZipBuffer(files);
    console.log("✅ ZIP buffer created, size:", zipBuffer.length);
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
