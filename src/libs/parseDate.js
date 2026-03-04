function parseDate(dateStr) {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split("/");
  return new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
}

module.exports = { parseDate };