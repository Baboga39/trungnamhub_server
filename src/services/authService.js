// src/services/authService.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../libs/prisma");
const { parseDate } = require("../libs/parseDate");
const { formatDate } = require("../libs/formatDate");

const JWT_SECRET = process.env.JWT_SECRET || "supersecret"; 
const JWT_EXPIRES = "7d";

async function register(name, email, password) {
  await exitingEmail(email);

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { name, email, password: hashed },
  });

  return { id: user.id, name: user.name, email: user.email };
}

async function exitingEmail(email) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw { statusCode: 400, message: "Email already registered" };
  }
}

async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw { statusCode: 401, message: "User not found" };

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw { statusCode: 401, message: "Invalid Password" };
  const startYear = formatDate(user.startYear);

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      startYear: startYear,
      sumEvent: user.sumEvent,
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES,
    }
  );

  return { token };
}

async function resetPassword(email, newPassword, confirmPassword) {
  if (newPassword !== confirmPassword) {
    throw { statusCode: 400, message: "Passwords do not match" };
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email },
    data: { password: hashed },
  });

  return;
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function changeInfo(user, email, name) {
  return await prisma.user.update({
    where: { id: user.userId },
    data: { email, name },
  });
}

async function getPermission(userId ) {
  const permissions = await prisma.screenPermission.findMany({
    where: { userId  },
    select: {
      screenId: true,
    },
  });

  return permissions.map(p => p.screenId);
}
async function upSertPermission(data) {
    const { userId, screenIds } = data;

    return await prisma.$transaction([
      prisma.screenPermission.deleteMany({
        where: { userId },
      }),
      prisma.screenPermission.createMany({
        data: screenIds.map((id) => ({
          userId,
          screenId: id,
        })),
      }),
    ]);

}
module.exports = {
  register,
  login,
  verifyToken,
  changeInfo,
  resetPassword,
  getPermission,
  upSertPermission
};
