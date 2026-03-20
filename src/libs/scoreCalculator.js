function calculateTotalScoreDynamic(formData, categories) {
  let weightedSum = 0;
  let totalWeight = 0;

  const nameMap = {
    "Kiến thức": "knowledge",
    "Kỹ năng": "skill",
    "Chuyên cần": "attendance",
    Thưởng: "bonus",
    Phạt: "penalty",
  };

  for (const cat of categories) {
    // ❌ bỏ thưởng / phạt khỏi weighted
    if (cat.name === "Thưởng" || cat.name === "Phạt") continue;

    const key = nameMap[cat.name] || cat.name;

    const value = Number(formData[key]) || 0;

    weightedSum += value * cat.weight;
    totalWeight += cat.weight;
  }

  const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const bonus = Number(formData.bonus) || 0;
  const penalty = Number(formData.penalty) || 0;
  const activityScore = Number(formData.activityScore) || 0;

  const finalScore = baseScore + bonus - penalty + activityScore;

  return Number(finalScore.toFixed(1));
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
