function calculateTotalScoreDynamic(formData, categories) {
  let weightedSum = 0;
  let totalWeight = 0;

  const nameMap = {
    "Kiến thức": "knowledge",
    "Kỹ năng": "skill",
    "Chuyên cần": "attendance",
  };

  for (const cat of categories) {
    const key = nameMap[cat.name] || cat.name;
    let value = parseFloat(String(formData[key] || "").replace(/^0+/, "")) || 0;
    weightedSum += value * cat.weight;
    totalWeight += cat.weight;
  }

  const bonus = Number(formData.bonus) || 0;
  const penalty = Number(formData.penalty) || 0;

  const avgScore = totalWeight > 0
    ? (weightedSum + bonus - penalty) / totalWeight
    : 0;

  return Number(avgScore.toFixed(1));
}

function getRank(totalScore) {
  if (totalScore >= 8) return "Xuất sắc";
  if (totalScore >= 6.5) return "Khá";
  if (totalScore >= 5.0) return "Trung bình";
  return "Yếu";
}

module.exports = {
  calculateTotalScoreDynamic,
  getRank,
};
