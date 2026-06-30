const fs = require("fs");
const path = require("path");
const os = require("os");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

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
  if (browser) {
    try {
      await browser.version();
      return browser;
    } catch {
      browser = null;
    }
  }

  console.log("Launching Chromium...");

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
  });

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