const express = require("express");
const { listTasks, createTask, updateTask, deleteTask } = require("../controllers/taskController");

const router = express.Router();

router.get("/user/:id/tasks", listTasks);
router.post("/task", createTask);
router.put("/task/:id", updateTask);
router.delete("/task/:id", deleteTask);

module.exports = router;
