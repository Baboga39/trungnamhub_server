const express = require("express");
const controller = require("../controllers/member.controller");
const middlewares  = require("../middlewares");
const { memberSchema } = require("../validations/member.validator");

const router = express.Router();

router.get("/", controller.getAll);
router.get("/active", controller.getMembersActive);
router.post("/",middlewares.auth,middlewares.validation(memberSchema), controller.upsert);  
router.delete("/:id", controller.remove); 
router.patch("/status", controller.changeStatus);
router.get("/:memberId/history", controller.getMemberStatusHistory);
router.delete("/history/:id", middlewares.auth, controller.deleteHistoryById);







router.get("/:id", controller.getById);


module.exports = router;
