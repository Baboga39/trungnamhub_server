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



module.exports = { getUsers, deleteUser, upsertUser };
