const services = require("../services");
const { asyncHandler } = require("../middlewares");

const upsert = asyncHandler(async (req, res) => {
  const member = await services.memberService.upsertMember(req.body, req.user);
  return res.ok(member, "Member upsert success");
});

const getAll = asyncHandler(async (req, res) => {
  const members = await services.memberService.getMembers(req.user);
  return res.ok(members, "Get members success");
});

const getById = asyncHandler(async (req, res) => {
  const member = await services.memberService.getMemberById(+req.params.id);
  if (!member) return res.notFound(null, "Member not found");
  return res.ok(member, "Get member success");
});

const getMembersActive = asyncHandler(async (req, res) => {
  const members = await services.memberService.getMembersActive(req.user);
  return res.ok(members, "Get members success");
});

const remove = asyncHandler(async (req, res) => {
  const member = await services.memberService.softDeleteMember(+req.params.id);
  return res.ok(member, "Member deleted (soft)");
});

const changeStatus = asyncHandler(async (req, res) => {
  const { memberId, active, promotionDate, note } = req.body;
  const member = await services.memberService.changeMemberStatus(memberId, active, promotionDate, note);
  return res.ok(member, "Member status changed successfully");
});

const getMemberStatusHistory = asyncHandler(async (req, res) => {
  const memberStatusHistory = await services.memberService.getMemberStatusHistory(req.params.memberId);
  return res.ok(memberStatusHistory, "Member status history fetched successfully");
});

const deleteHistoryById = asyncHandler(async (req, res) => {
  await services.memberService.deleteHistory(req.body.ids);
  return res.ok(null, "History deleted successfully");
});

const promoteBranch = asyncHandler(async (req, res) => {
  const { memberId, note, effectiveDate } = req.body;
  const member = await services.memberService.promoteBranch(memberId, note, effectiveDate);
  return res.ok(member, "Branch promoted successfully");
});

const getBranchList = asyncHandler(async (req, res) => {
  const list = services.memberService.getBranchList();
  return res.ok(list, "Branch list fetched successfully");
});

module.exports = {
  upsert,
  getAll,
  getById,
  remove,
  getMembersActive,
  changeStatus,
  getMemberStatusHistory,
  deleteHistoryById,
  promoteBranch,
  getBranchList,
};