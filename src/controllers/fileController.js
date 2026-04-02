const { uploadToCloudinary } = require("../libs/cloudinaryService");
const fs = require('fs');

async function uploadFile(req, res, next) {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "File is required" });
  }

  try {
    const uploaded = await uploadToCloudinary(file);
    res.status(200).json({
      message: "File uploaded successfully",
      fileUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
    });
  } catch (err) {
    next(err);
  } finally {
    if (file && file.path) {
      fs.promises.unlink(file.path).catch(console.error);
    }
  }
}

module.exports = {
  uploadFile,
};
