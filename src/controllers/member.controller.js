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

module.exports = { upsert, getAll, getById, remove, getMembersActive };
