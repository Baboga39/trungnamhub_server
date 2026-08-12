/**
 * Tính điểm tổng có trọng số (weighted average).
 *
 * QUAN TRỌNG:
 * - Chỉ tính các category THỰC TẾ có điểm trong formData.
 * - Nếu category không có score (null / undefined / ""), KHÔNG tính vào weight.
 * - Không coi missing score là 0.
 *
 * @param {object} formData  - Map điểm: { [catId|catName|key]: score }
 * @param {Array}  categories - Danh sách GradeCategory từ DB (có .id, .name, .weight)
 */
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
    // Thưởng / Phạt được xử lý riêng bên dưới
    if (cat.name === "Thưởng" || cat.name === "Phạt") continue;

    const key = nameMap[cat.name] || cat.name;
    const normKey = cat.name.toLowerCase().replace(/\s+/g, "_");

    const rawValue =
      formData[cat.id] ??
      formData[key] ??
      formData[cat.name] ??
      formData[normKey];

 

        const value = Number(rawValue) || 0;


    weightedSum += value * cat.weight;
    totalWeight += cat.weight;
  }

  const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const bonus =
    Number(formData.bonus ?? formData["Thưởng"] ?? formData["thưởng"]) || 0;
  const penalty =
    Number(formData.penalty ?? formData["Phạt"] ?? formData["phạt"]) || 0;
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
