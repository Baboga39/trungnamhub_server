const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      file.path,
      {
        folder: "documents",
        resource_type: "raw", // Raw allows non-image files like PDF, DOCX
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
}

async function deleteFromCloudinary(public_id) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      public_id,
      { resource_type: "raw" }, // Must match resource_type used during upload
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
}

function extractPublicId(fileUrl) {
  try {
    const url = new URL(fileUrl);
    const pathParts = url.pathname.split("/");
    const uploadIndex = pathParts.findIndex((p) => p === "upload");
    if (uploadIndex === -1) return null;
    return decodeURIComponent(pathParts.slice(uploadIndex + 2).join("/"));
  } catch (e) {
    return null;
  }
}

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
};