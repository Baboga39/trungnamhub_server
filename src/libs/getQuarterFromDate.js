function getQuarterFromDate(date) {
  const month = date.getMonth() + 1;
  return Math.ceil(month / 3);
}

export default getQuarterFromDate;