const express = require("express");
const router = express.Router();
const middlewares = require("../middlewares");

const fileController = require("../controllers/fileController");

// The middleware parses the incoming multipart/form-data and puts 'req.file'
router.post(
  "/upload",
  middlewares.auth,
  middlewares.upload.single("file"),
  fileController.uploadFile
);

module.exports = router;
