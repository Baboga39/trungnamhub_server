const userService = require("../services/user.service");

async function getUsers(req, res, next) {
  try {
    const users = await userService.getAllUsers();
    res.ok(users, "Fetched users successfully");
  } catch (err) {
    next(err);
  }
}


async function upsertUser(req, res, next) {
  try {
    const data = req.body;
    const member = await userService.upsertUser(data);
    res.ok(member, "Successfully");
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    const deletedUser = await userService.deleteUser(id);
    res.ok(deletedUser, "User deleted successfully");
  } catch (err) {
    next(err);
  }
}

async function testSend(req, res) {
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
}



module.exports = { getUsers, deleteUser, upsertUser, testSend };
