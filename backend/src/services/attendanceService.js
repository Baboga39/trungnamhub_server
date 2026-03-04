// src/services/attendanceService.js
const prisma = require("../libs/prisma");
const sessionService = require("./sessionService");
const { updateAttendanceScore } = require("./gradeService");


function validateRecordsFormat(recordsByDate) {
  if (!recordsByDate || typeof recordsByDate !== "object") {
    throw { statusCode: 400, message: "Invalid records format" };
  }
}


function parseValidDate(dateKey) {
  const parsed = new Date(dateKey);
  if (isNaN(parsed)) return null;
  return parsed;
}

async function findExistingAttendance(date, memberId) {
  return prisma.attendance.findUnique({
    where: {
      date_memberId: {
        date,
        memberId,
      },
    },
  });
}

/**
 * Standard include fields for attendance queries.
 */
const attendanceInclude = {
  member: { select: { id: true, name: true, church: true } },
  markedBy: { select: { id: true, name: true } },
};

async function markAttendance(user, recordsByDate) {
  validateRecordsFormat(recordsByDate);

  const results = [];

  for (const [dateKey, members] of Object.entries(recordsByDate)) {
    const parsedDate = parseValidDate(dateKey);
    if (!parsedDate) continue;

    const session = await  sessionService.ensureSession(parsedDate, user.userId);

    for (const [memberIdStr, record] of Object.entries(members)) {
      const memberId = Number(memberIdStr);
      if (!memberId || !record || typeof record !== "object") continue;

      const { status, note } = record;
      if (!status) continue;

      const existing = await findExistingAttendance(parsedDate, memberId);

      const data = {
        userId: user.userId,
        parsedDate,
        memberId,
        status,
        note,
        existing,
      };

      let result;
      if (existing) {
        result = await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            status,
            note,
            markedById: user.userId,
            sessionId: session.id,    // 👈 gắn sessionId cho bản update
            updatedAt: new Date(),
          },
        });
      } else {
        result = await prisma.attendance.create({
          data: {
            date: parsedDate,
            status,
            note,
            memberId,
            markedById: user.userId,
            sessionId: session.id,    // 👈 gắn sessionId cho bản create
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

            await updateAttendanceScore(memberId);

      results.push(result);
    }
  }

  return results;
}


/**
 * Get attendance list by specific date.
 */
async function getAttendanceByDate(date) {
  const parsedDate = parseValidDate(date);
  if (!parsedDate) throw { statusCode: 400, message: "Invalid date" };

  return prisma.attendance.findMany({
    where: { date: parsedDate },
    include: attendanceInclude,
  });
}

/**
 * Get all attendance records.
 */
async function getAttendanceAll() {
  return prisma.attendance.findMany({
    include: attendanceInclude,
  });
}

/**
 * Get attendance history by member.
 */
async function getAttendanceByMember(memberId) {
  return prisma.attendance.findMany({
    where: { memberId: Number(memberId) },
    orderBy: { date: "desc" },
    include: attendanceInclude,
  });
}

/* ----------------------------- 🔹 Exports ----------------------------- */
module.exports = {
  markAttendance,
  getAttendanceByDate,
  getAttendanceByMember,
  getAttendanceAll,
};
