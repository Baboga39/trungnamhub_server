const axios = require("axios");

const PING_SERVICE = "https://ping-render-mz9o.onrender.com/health";

let isRunning = false;

async function pingService() {
  if (isRunning) return; // tránh overlap
  isRunning = true;

  try {
    const res = await axios.get(PING_SERVICE, {
      timeout: 5000, // 5s timeout
    });
    console.log("✅ Ping success:", res.status);
  } catch (err) {
    console.error("❌ Ping error:", {
      message: err.message,
      status: err.response?.status,
    });
  } finally {
    isRunning = false;
  }
}

function startPing() {
  pingService(); 

  setInterval(pingService, 60 * 1000);
}

module.exports = startPing;