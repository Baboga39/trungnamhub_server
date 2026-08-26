// src/routes/aiChatRoutes.js
const express = require("express");
const router = express.Router();
const aiChatController = require("../controllers/aiChatController");
const middlewares = require("../middlewares");

router.post("/chat", middlewares.auth, aiChatController.handleChat);
router.get("/suggestions", middlewares.auth, aiChatController.getSuggestions);

module.exports = router;
