// src/services/attendanceService.js
const prisma = require("../libs/prisma");
const sessionService = require("./sessionService");
const { updateAttendanceScore, recalculateAllAttendanceScores } = require("./gradeService");
const { buildBranchFilter } = require("./member.service");


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
  member: { select: { id: true, name: true, church: true, branch: true } },
  markedBy: { select: { id: true, name: true } },
};

async function markAttendance(user, recordsByDate) {
  validateRecordsFormat(recordsByDate);

  const results = [];

  for (const [dateKey, members] of Object.entries(recordsByDate)) {
    const parsedDate = parseValidDate(dateKey);
    if (!parsedDate) continue;

    // Get all member IDs
    const memberIds = Object.keys(members)
      .map(Number)
      .filter(Boolean);

    if (memberIds.length === 0) continue;

    // Get members + their branch
    const memberList = await prisma.member.findMany({
      where: {
        id: {
          in: memberIds,
        },
      },
      select: {
        id: true,
        branch: true,
      },
    });

    // Convert to Map for quick lookup
    const memberMap = new Map(
      memberList.map((member) => [
        member.id,
        member,
      ])
    );

    // Session branch
    // If all members in this request belong to the same branch,
    // use that branch for the session.
    const detectedBranch =
      memberList.find((member) => member.branch)?.branch ||
      user?.branch ||
      null;

    const session = await sessionService.ensureSession(
      parsedDate,
      user.userId,
      detectedBranch
    );

    for (const [memberIdStr, record] of Object.entries(members)) {
      const memberId = Number(memberIdStr);

      if (!memberId || !record || typeof record !== "object") {
        continue;
      }

      const { status, note } = record;

      if (!status) continue;

      // Get member information
      const member = memberMap.get(memberId);

      if (!member) {
        console.warn(`Member ${memberId} not found`);
        continue;
      }

      // ⭐ Branch belongs to the member being marked
      const memberBranch = member.branch || null;

      const existing = await findExistingAttendance(
        parsedDate,
        memberId
      );

      let result;

      if (existing) {
        result = await prisma.attendance.update({
          where: {
            id: existing.id,
          },
          data: {
            status,
            note,
            branch: memberBranch, 
            markedById: user.userId,
            sessionId: session.id,
            updatedAt: new Date(),
          },
        });
      } else {
        result = await prisma.attendance.create({
          data: {
            date: parsedDate,
            status,
            note,
            branch: memberBranch, 
            memberId,
            markedById: user.userId,
            sessionId: session.id,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }

      results.push(result);
    }

    await recalculateAllAttendanceScores(parsedDate);
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
async function getAttendanceSummary(date, sessionId) {
  const parsedDate = parseValidDate(date);

  if (!parsedDate) {
    throw {
      statusCode: 400,
      message: "Invalid date",
    };
  }

  const session = await prisma.session.findUnique({
    where: {
      id: Number(sessionId),
    },
  });

  if (!session) {
    throw {
      statusCode: 404,
      message: "Session not found",
    };
  }

  const records = await prisma.attendance.findMany({
    where: {
      date: parsedDate,
      sessionId: Number(sessionId),
    },
    include: attendanceInclude,
  });

  const totalMemberCount = await prisma.member.count({
    where: {
      active: true,
      branch: session.branch,
    },
  });

  let lateCount = 0;
  let absentCount = 0;

  for (const record of records) {
    const status = String(record.status || "").toUpperCase();

    if (status === "LATE" || status === "TRE") {
      lateCount++;
    } else if (status === "ABSENT" || status === "VANG") {
      absentCount++;
    }
  }

  const presentCount = Math.max(
    0,
    totalMemberCount - lateCount - absentCount
  );

  return {
    records,
    totalMemberCount,
    presentCount,
    lateCount,
    absentCount,
    actualParticipantCount: presentCount + lateCount,
  };
}
/**
 * Get all attendance records.
 */
async function getAttendanceAll(user) {
  return prisma.attendance.findMany({
    where: {
      session: {
        branch: user.branch,
      },
    },
    include: attendanceInclude,
    orderBy: {
      date: "desc",
    },
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
  getAttendanceSummary,
};
