// src/controllers/authController.js
const services = require("../services");
async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const user = await services.authService.register(name, email, password);
    return res.ok(user, "Register success");
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
  
    const data = await services.authService.login(email, password);
    return res.ok(data, "Login success");
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
    try {
      const user = req.user;
      const email = req.body.email || user.email;
      const { newPassword, confirmPassword } = req.body;
      await services.authService.resetPassword(email, newPassword, confirmPassword);
      return res.ok(null, "Password reset success");
    } catch (err) {
        next(err);
    }
}

async function changeInfo(req, res, next) {
  try {
    const user = req.user;
    const { email, name } = req.body;
    const result = await services.authService.changeInfo(user, email, name);
    result.password= null
    return res.ok(result, "Change info success");
  } catch (err) {
    next(err);
  }
}

async function getPermission(req, res, next) {
  try {
    const {id} = req.params;
    const data = await services.authService.getPermission(id);
    return res.ok(data, "Get permission success");
  } catch (err) {
    next(err);
  }
}
async function upSertPermission(req, res, next) {
  try {
    const data = req.body;
    const result = await services.authService.upSertPermission(data);
    return res.ok(result, "Upsert permission success");
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, resetPassword , changeInfo,getPermission,upSertPermission};
