const axios = require("axios");

const NOTIFY_SERVICE_URL = (
  process.env.NOTIFY_SERVICE_URL || "http://localhost:5002"
).replace(/\/+$/, "");

const NOTIFY_INTERNAL_KEY =
  process.env.NOTIFY_INTERNAL_KEY || "trungnam-internal-notify-key";

/**
 * Fire-and-forget helper to push real-time notifications to the Rust Notification Service.
 * Never throws so Core business operations are never blocked if the notify service is offline.
 */
async function sendNotification(payload) {
  try {
    await axios.post(`${NOTIFY_SERVICE_URL}/internal/notify`, payload, {
      timeout: 2500,
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": NOTIFY_INTERNAL_KEY,
      },
    });
  } catch (err) {
    console.warn(
      "[notifyClient] Failed to dispatch notification:",
      err?.message || err
    );
  }
}

module.exports = { sendNotification };
