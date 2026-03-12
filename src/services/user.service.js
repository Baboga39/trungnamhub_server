const { usersReportSchema } = require("../libs/columnSchemas/usersReport");
const { parseDate } = require("../libs/parseDate");
const prisma = require("../libs/prisma");
const { sendReportMail } = require("./mailService/mailService");
const bcrypt = require("bcrypt");


async function getAllUsers() {
 
const meta = {
  toEmail: "ngochai06122002@gmail.com",
  tenTruongDoan: "Nguyễn Thành Long",
  tieuDeBaoCao: "Báo cáo đoàn sinh tháng 10",
  tenNguoiGui: "Ban Điều Hành Trung Nam",
  loaiBaoCao: "Tổng hợp tháng",
};
 const result = await prisma.user.findMany({
    include: { members: true },
  });
await sendReportMail(result,meta,usersReportSchema);

  return result;
}



async function createUser(data) {
  return prisma.user.create({ data });
}

async function upsertUser(data, user) {
  let hashed = undefined;
  if (data.password) {
    hashed = await bcrypt.hash(data.password, 10);
  }

  return prisma.user.upsert({
    where: { id: data.id || 0 },
    update: { ...data, startYear: parseDate(data.startYear) , password: hashed },
    create: { ...data, startYear: parseDate(data.startYear), password: hashed },
  });
}

async function deleteUser(id) {
  return prisma.user.delete({ where: { id } });
}

module.exports = { getAllUsers, createUser, upsertUser, deleteUser };
