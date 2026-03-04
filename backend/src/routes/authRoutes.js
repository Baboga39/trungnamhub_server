// src/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController")
const  middlewares  = require("../middlewares");
const { loginSchema, registerSchema, resetPasswordSchema, changeInfoSchema, getPermissionSchema, upSertPermissionSchema } = require("../validations/authValidation");
const validate = require("../middlewares/validate");

router.post("/register",middlewares.validation(registerSchema), authController.register);
router.post("/login",middlewares.validation(loginSchema), authController.login);
router.put("/reset-password",middlewares.auth, middlewares.validation(resetPasswordSchema), authController.resetPassword);
router.put("/change-info",middlewares.validation(changeInfoSchema), middlewares.auth, authController.changeInfo);
router.get("/permissions/:id", middlewares.auth, middlewares.validation(getPermissionSchema,"params"), authController.getPermission);
router.post("/permissions/upsert", middlewares.auth,middlewares.validation(upSertPermissionSchema), authController.upSertPermission);

module.exports = router;
  