const userService = require("../services/user.service");
const { asyncHandler } = require("../middlewares");

const getUsers = asyncHandler(async (req, res) => {
  const users = await userService.getAllUsers();
  res.ok(users, "Fetched users successfully");
});

const upsertUser = asyncHandler(async (req, res) => {
  const data = req.body;
  const member = await userService.upsertUser(data);
  res.ok(member, "Successfully");
});

const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deletedUser = await userService.deleteUser(id);
  res.ok(deletedUser, "User deleted successfully");
});

const testSend = asyncHandler(async (req, res) => {
  await userService.sendDinnerInvitation({
    toEmail: "phannhung05121999@gmail.com",
    name: "Em bé của anh",
    date: "Thứ Bảy, 29 Tháng 3",
    time: "19:00 - 22:00",
    location: "Ruby Koi Bistro",
    address: "115 Nguyễn Hữu Thọ, Bà Rịa",
    message: "Anh muốn chỉ dành cho em những điều tốt đẹp nhất 💖",
  });

  res.json({ message: "Sent!" });
});

module.exports = { getUsers, deleteUser, upsertUser, testSend };
