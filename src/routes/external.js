// src/routes/dinnerRoute.js

const express = require("express");
const router = express.Router();

const {sendDinnerInvitationMail} = require("../services/mailService/mailService");

router.post("/send-dinner-invite", async (req, res) => {
  try {
    await sendDinnerInvitationMail();

    return res.status(200).json({
      success: true,
      message: "Dinner invitation sent 💌",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to send invitation",
      error: error.message,
    });
  }
});

module.exports = router;