const express = require("express");
const { userController } = require("../controllers");
const middleware = require("../middlewares");
const { userUpsertSchema, deleteUserSchema } = require("../validations/userValidation");

const router = express.Router();

router.get("/", userController.getUsers);
router.post("/upsert",middleware.auth,middleware.validation(userUpsertSchema), userController.upsertUser);
router.delete("/:id",middleware.auth, middleware.validation(deleteUserSchema,'params'), userController.deleteUser);

module.exports = router;
