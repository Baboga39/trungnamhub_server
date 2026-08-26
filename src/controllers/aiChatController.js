// src/controllers/aiChatController.js
const aiChatService = require("../services/aiChatService");

async function handleChat(req, res, next) {
  try {
    const { message, history } = req.body;
    const result = await aiChatService.processChatMessage({
      message,
      history,
      userContext: req.user,
    });
    return res.ok(result, "Chat response generated successfully");
  } catch (err) {
    next(err);
  }
}

async function getSuggestions(req, res, next) {
  try {
    const suggestions = aiChatService.getQuickSuggestions(req.user);
    return res.ok(suggestions, "Get suggestions success");
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleChat,
  getSuggestions,
};
