// src/middlewares/responseFormatter.js
const { formatDate } = require("../libs/formatDate");

function isISODateString(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  );
}

function formatDatesDeep(obj) {

  if (obj === null || obj === undefined) return obj;

  // Nếu là Date object
  if (obj instanceof Date) {
    return formatDate(obj);
  }

  // Nếu là ISO string
  if (isISODateString(obj)) {
    return formatDate(new Date(obj));
  }

  // Nếu là Array
  if (Array.isArray(obj)) {
    return obj.map(item => formatDatesDeep(item));
  }

  // Nếu là Object
  if (typeof obj === "object") {
    const newObj = {};
    for (const key in obj) {
      newObj[key] = formatDatesDeep(obj[key]);
    }
    return newObj;
  }

  return obj;
}

function responseFormatter(req, res, next) {
  const oldJson = res.json;
  res.json = function (data) {
    const formattedData = formatDatesDeep(data);
    return oldJson.call(this, formattedData);
  };
  next();
}

module.exports = { responseFormatter };
