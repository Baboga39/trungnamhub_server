const { usersReportSchema } = require("../libs/columnSchemas/usersReport");
const { parseDate } = require("../libs/parseDate");
const prisma = require("../libs/prisma");
const { sendReportMail } = require("./mailService/mailService");
const bcrypt = require("bcrypt");


async function getAllUsers() {
 
const meta = {
  toEmail: "phannhung05121999@gmail.com",
  tenTruongDoan: "Nguyễn Thành Long",
  tieuDeBaoCao: "Báo cáo đoàn sinh tháng 10",
  tenNguoiGui: "Ban Điều Hành Trung Nam",
  loaiBaoCao: "Tổng hợp tháng",
};
 const result = await prisma.user.findMany({
    include: { members: true },
  });
// await sendReportMail(result,meta,usersReportSchema);

  return result;
}

async function sendDinnerInvitation(metaInput) {
  try {
    if (!metaInput?.toEmail) {
      throw new Error("Missing toEmail");
    }

    const meta = {
      toEmail: metaInput.toEmail,
      name: metaInput.name || "Em yêu",
      date: metaInput.date || "Thứ Bảy, 29 Tháng 3",
      time: metaInput.time || "19:00 - 22:00",
      location: metaInput.location || "Ruby Koi Bistro",
      address: metaInput.address || "115 Nguyễn Hữu Thọ, Bà Rịa",
      message:
        metaInput.message ||
        "Anh muốn dành thời gian chỉ có mình em",
      tieuDeBaoCao:
        metaInput.tieuDeBaoCao || "Lời mời ăn tối 💖",
    };

    await sendReportMail({
      meta,
      attachments: [],
    });

    console.log(`💌 Invitation sent to ${meta.toEmail}`);

    return {
      success: true,
      message: "Send invitation successfully 💖",
    };
  } catch (err) {
    console.error("❌ Send invitation failed:", err.message);
    throw err;
  }
}

module.exports = {
  sendDinnerInvitation,
};



async function createUser(data) {
  return prisma.user.create({ data });
}

async function upsertUser(data, user) {
  const baseData = {
    name: data.name,
    email: data.email,
    role: data.role,
    branch: data.branch,
    startYear: parseDate(data.startYear),
    sumEvent: data.sumEvent ?? 0,
  };

  let hashed;

  if (data.password) {
    hashed = await bcrypt.hash(data.password, 10);
  }

  // Có ID => UPDATE
  if (data.id !== undefined && data.id !== null && data.id !== "") {
    return prisma.user.update({
      where: {
        id: Number(data.id),
      },

      data: {
        ...baseData,
        ...(hashed ? { password: hashed } : {}),
      },
    });
  }

  // Không có ID => CREATE
  return prisma.user.create({
    data: {
      ...baseData,
      password: hashed || await bcrypt.hash("123456", 10),
    },
  });
}
async function deleteUser(id) {
  return prisma.user.delete({ where: { id } });
}

module.exports = { getAllUsers, createUser, upsertUser, deleteUser , sendDinnerInvitation};
