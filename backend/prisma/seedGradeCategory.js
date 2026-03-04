import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding GradeCategory...");

  // ⚠️ Giả sử đã có sẵn user có id = 1 (hoặc sửa thành ID thật của bạn)
  const createdById = 1;

  // Các hạng mục theo công thức bạn đưa:
  const categories = [
    { name: "Kiến thức", weight: 3 },
    { name: "Kỹ năng", weight: 3 },
    { name: "Chuyên cần", weight: 2 },
    { name: "Thưởng", weight: 1 },
    { name: "Phạt", weight: -1 },
  ];

  // Upsert (tạo nếu chưa có, update nếu trùng tên)
  for (const cat of categories) {
    await prisma.gradeCategory.upsert({
      where: { name: cat.name },
      update: { weight: cat.weight, active: true },
      create: {
        name: cat.name,
        weight: cat.weight,
        active: true,
        createdById, // khóa ngoại tới bảng User
      },
    });
  }

  console.log("✅ Seed GradeCategory completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
