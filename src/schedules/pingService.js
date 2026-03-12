const axios = require("axios");

const PING_SERVICE = "https://ping-render-mz9o.onrender.com/health";

async function pingService() {
  try {
    const res = await axios.get(PING_SERVICE);
    console.log("Ping ping-service:", res.status);
  } catch (err) {
    console.log("Ping service error:", err.message);
  }
}

setInterval(pingService, 5 * 60 * 1000);

module.exports = startTestSchedule;