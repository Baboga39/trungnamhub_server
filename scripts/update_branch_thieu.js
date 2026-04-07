const prisma = require("../src/libs/prisma");

async function main() {
  console.log("--- Bắt đầu cập nhật ngành cho tất cả Member ---");

  try {
    // Cập nhật tất cả các record trong bảng Member
    const result = await prisma.member.updateMany({
      data: {
        branch: "Thiếu",
      },
    });

    console.log(`✅ Thành công! Đã cập nhật ${result.count} đoàn sinh sang ngành "Thiếu".`);
    
    // Nếu bạn muốn cập nhật cả bảng User (vì User cũng có cột branch) 
    // thì có thể bỏ comment đoạn dưới đây:
    /*
    const userResult = await prisma.user.updateMany({
      data: { branch: "Thiếu" }
    });
    console.log(`✅ Đã cập nhật ${userResult.count} người dùng sang ngành "Thiếu".`);
    */

  } catch (error) {
    console.error("❌ Có lỗi xảy ra trong quá trình cập nhật:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
