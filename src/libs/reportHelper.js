const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const retry = async (fn, times = 3, delay = 500) => {
  let lastError;

  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.log(`Retry lần ${i + 1} thất bại...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }

  throw lastError;
};

const ensureDir = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const fillRows = (rows, maxRows) => {
  const result = [...rows];
  while (result.length < maxRows) result.push(null);
  return result;
};
let browser;

const getBrowser = async () => {
  // Nếu browser bị crash/disconnect, đặt lại để khởi động mới
  if (browser) {
    try {
      // Kiểm tra browser còn sống không
      await browser.version();
      return browser;
    } catch (_) {
      browser = null;
    }
  }

  const launchOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ],
  };

  // Trên Render (Linux), thử tìm Chrome đã được cài bởi puppeteer browsers install
  const os = require("os");
  if (os.platform() !== "win32" && os.platform() !== "darwin") {
    try {
      // puppeteer tự động tìm Chrome đã cài, không cần set executablePath
      // nhưng nếu PUPPETEER_EXECUTABLE_PATH được set trong env thì dùng nó
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }
    } catch (_) {}
  }

  browser = await puppeteer.launch(launchOptions);
  return browser;
};

const getAttendanceText = (status) => {
  switch (status) {
    case "present":
      return "Có mặt";
    case "absent":
      return "Vắng";
    case "late":
      return "Trễ";
    case "excused":
      return "Có phép";
    default:
      return "";
  }
};
const getAttendanceColor = (status) => {
  switch (status) {
    case "present":
      return "#16a34a"; // xanh
    case "absent":
      return "#dc2626"; // đỏ
    case "late":
      return "#f59e0b"; // vàng
    case "excused":
      return "#2563eb"; // xanh dương
    default:
      return "#000";
  }
};

module.exports = {
  retry,
  ensureDir,
  fillRows,
  getBrowser,
  getAttendanceText,
  getAttendanceColor,
};