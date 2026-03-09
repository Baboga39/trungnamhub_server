const cron = require("node-cron");

function startTestSchedule() {
  // chạy mỗi 2 giây
  cron.schedule("*/2 * * * * *", () => {
    console.log("🔥 Schedule running every 2 seconds:", new Date());
  });
}

module.exports = startTestSchedule;