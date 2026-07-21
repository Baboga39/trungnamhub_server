const { parseDate } = require("../libs/parseDate");
const prisma = require("../libs/prisma");

function normalizeBranch(branch) {
  return branch?.trim().normalize("NFC");
}

function buildBranchFilter(user) {
  if (user?.role === "admin") return {};

  const branch = normalizeBranch(user?.branch);

  if (branch) return { branch };

  throw { statusCode: 403, message: "User does not have a branch assigned" };
}
async function saveStatusHistory(
  tx,
  oldMember,
  newMember,
  note = null
) {
  const oldPromotion = oldMember?.promotionDate?.getTime() ?? null;
  const newPromotion = newMember.promotionDate?.getTime() ?? null;

  const changed =
    !oldMember ||
    oldMember.active !== newMember.active ||
    oldPromotion !== newPromotion;

  if (!changed) return;

  let historyNote = note;

  if (!historyNote) {
    if (newMember.active) {
      historyNote = "Activated";
    } else if (newMember.promotionDate) {
      historyNote = "Promoted";
    } else {
      historyNote = "Deactivated";
    }
  }

  let type;

if (newMember.active) {
  type = "ACTIVE";
} else if (newMember.promotionDate) {
  type = "PROMOTED";
} else {
  type = "INACTIVE";
}

await tx.memberStatusHistory.create({
  data: {
    memberId: newMember.id,
    status: newMember.active,
    type,
    date: newMember.promotionDate ?? new Date(),
    note: historyNote,
  },
});
}
async function upsertMember(data, user) {
  const { id, ...rest } = data;

  const memberData = {
    ...rest,
    birthDate: parseDate(rest.birthDate),
    startDate: parseDate(rest.startDate),
    promotionDate: parseDate(rest.promotionDate),
  };

  return prisma.$transaction(async (tx) => {
    if (!id) {
      const created = await tx.member.create({
        data: {
          ...memberData,
          createdById: user.userId,
          branch: rest.branch || user.branch,
        },
      });

      await saveStatusHistory(tx, null, created);

      return created;
    }

    const oldMember = await tx.member.findUnique({
      where: { id },
    });

    if (!oldMember) {
      throw {
        statusCode: 404,
        message: "Member not found",
      };
    }

    const updated = await tx.member.update({
      where: { id },
      data: memberData,
    });

    await saveStatusHistory(tx, oldMember, updated);

    return updated;
  });
}

async function getMembers(user) {
  const members = await prisma.member.findMany({
  where: buildBranchFilter(user),
  select: {
    id: true,
    name: true,
    birthDate: true,
    gender: true,
    parish: true,
    church: true,
    startYear: true,
    startDate: true,
    branch: true,
    active: true,
    promotionDate: true,
    contact: true,
    fatherName: true,
    motherName: true,
    address: true,
    user: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
  },
});

return members.map((m) => ({
  ...m,
  status: m.active
    ? "ACTIVE"
    : m.promotionDate
      ? "PROMOTED"
      : "INACTIVE",
}));
}

async function getMembersActive(user) {
  const branchFilter = buildBranchFilter(user);
  return prisma.member.findMany({
    where: { active: true, ...buildBranchFilter(user) },
    select: {
      id: true,
      name: true,
      birthDate: true,
      gender: true,
      branch: true,
      promotionDate: true,
      contact: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
}

async function getMemberById(id) {
  return prisma.member.findUnique({
    where: { id },
    include: { user: true, attendances: true, grades: true },
  });
}

async function softDeleteMember(id) {
  return prisma.member.update({
    where: { id },
    data: { active: false },
  });
}

async function changeMemberStatus(
  memberId,
  active,
  promotionDate,
  note
) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw {
      statusCode: 404,
      message: "Member not found",
    };
  }

  if (active && promotionDate) {
    throw {
      statusCode: 400,
      message: "Active member cannot have promotion date.",
    };
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.member.update({
      where: { id: memberId },
      data: {
        active,
        promotionDate: promotionDate,
      },
    });

    await saveStatusHistory(tx, member, updated, note);

    return updated;
  });
}
async function getMemberStatusHistory(memberId) {
  return prisma.memberStatusHistory.findMany({
    where: { memberId: Number(memberId) },
    orderBy: { date: "desc" },
  });
}

async function deleteHistory(ids) {
  return prisma.memberStatusHistory.deleteMany({
    where: {
      id: {
        in: ids,
      },
    },
  });
}

module.exports = {
  upsertMember,
  getMembers,
  getMemberById,
  softDeleteMember,
  getMembersActive,
  changeMemberStatus,
  getMemberStatusHistory,
  deleteHistory,
};
