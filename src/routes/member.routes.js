const express = require("express");
const controller = require("../controllers/member.controller");
const middlewares  = require("../middlewares");
const { memberSchema } = require("../validations/member.validator");

const router = express.Router();

router.get("/", middlewares.auth, controller.getAll);
router.get("/active", middlewares.auth, controller.getMembersActive);
router.post("/",middlewares.auth,middlewares.validation(memberSchema), controller.upsert);  
router.patch("/status", middlewares.auth, controller.changeStatus);
router.get("/:memberId/history", middlewares.auth, controller.getMemberStatusHistory);
router.delete("/history", middlewares.auth, controller.deleteHistoryById);

router.delete("/:id", middlewares.auth, controller.remove); 






router.get("/:id", controller.getById);


module.exports = router;
