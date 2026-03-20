const services = require("../services");

async function upsert(req, res, next) {
  try {
    const user = req.user;
    const member = await services.memberService.upsertMember(req.body, user);
    return res.ok(member, "Member upsert success");
  } catch (err) {
    next(err);
  }
}

async function getAll(req, res, next) {
  try {
    const members = await services.memberService.getMembers();
    return res.ok(members, "Get members success");
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const member = await services.memberService.getMemberById(+req.params.id);
    if (!member) return res.notFound(null, "Member not found");
    return res.ok(member, "Get member success");
  } catch (err) {
    next(err);
  }
}

async function getMembersActive(req, res, next) {
  try {
    const members = await services.memberService.getMembersActive();
    return res.ok(members, "Get members success");
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const member = await services.memberService.softDeleteMember(+req.params.id);
    return res.ok(member, "Member deleted (soft)");
  } catch (err) {
    next(err);
  }
}

async function changeStatus(req, res, next) {
  try {
    const {memberId, dateChange, note } = req.body;
    const member = await services.memberService.changeMemberStatus(memberId, dateChange);
    return res.ok(member, "Member status changed successfully");
  } catch (err) {
    next(err);
  }
}

async function getMemberStatusHistory(req, res, next) {
  try {
    const memberId = req.params.memberId;
    const memberStatusHistory = await services.memberService.getMemberStatusHistory(memberId);
    return res.ok(memberStatusHistory, "Member status history fetched successfully");
  } catch (err) {
    next(err);
  }
}
async function deleteHistoryById(req, res, next) {
  try {
    const { id } = req.params;
    await services.memberService.deleteHistoryById(id);
    return res.ok(null, "History deleted successfully");
  } catch (err) {
    next(err);
  }
}

module.exports = { upsert, getAll, getById, remove, getMembersActive, changeStatus , getMemberStatusHistory, deleteHistoryById  };
