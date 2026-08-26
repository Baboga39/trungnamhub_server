const prisma = require("./src/libs/prisma");
const aiChatService = require("./src/services/aiChatService");

async function testFinal() {
  try {
    const userContext = {
      id: 7,
      name: "Trưởng Xứ đoàn",
      role: "admin",
      branch: "all",
    };

    console.log("Testing processChatMessage with query: 'Tóm tắt tình hình Ngành Thiếu Quý này'");
    const res = await aiChatService.processChatMessage({
      message: "Tóm tắt tình hình Ngành Thiếu Quý này",
      history: [],
      userContext,
    });

    console.log("--- RESULT ---");
    console.log("Model used:", res.modelUsed);
    console.log("Tool called:", res.toolCalled);
    console.log("Reply:\n", res.reply);
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

testFinal();
