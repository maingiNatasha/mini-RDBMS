const { execute, useDemo } = require("../services/rdbmsService");
const { sqlString, sqlInt } = require("../utils/sql");

function parseAffected(result) {
    if (typeof result === "number") return result;
    if (typeof result === "string") {
        const match = result.match(/^(\d+)/);
        if (match) return Number(match[1]);
    }
    return null;
}

function listTasks(req, res, next) {
    try {
        // Set active database
        useDemo();

        // Retrieve id from parameters
        const userId = sqlInt(req.params.id);

        // Execute query and handle result
        const result = execute(`SELECT * FROM tasks WHERE user_id = ${userId};`);
        let rows = Array.isArray(result) ? result : (result?.rows ?? result);
        if (rows === "(0 rows)") rows = [];

        res.status(200).json({
            success: true,
            message: "Tasks fetched successfully.",
            data: rows,
        });
    } catch (err) {
        next(err);
    }
}

function createTask(req, res, next) {
    try {
        // Set active database
        useDemo();

        // Auto-generate id since the rdbms doesnt have auto-increment for columns
        let idValue;
        if (req.body.id !== undefined && req.body.id !== null) {
            idValue = sqlInt(req.body.id);
        } else {
            const idResult = execute("SELECT id FROM tasks;");
            const idRows = Array.isArray(idResult) ? idResult : (idResult?.rows ?? idResult);
            if (idRows === "(0 rows)") {
                idValue = "1";
            } else {
                const maxId = idRows.reduce((max, row) => Math.max(max, Number(row.id)), 0);
                idValue = String(maxId + 1);
            }
        }

        // Retrieve userId and title
        const userId = sqlInt(req.body.user_id);
        const title = sqlString(req.body.title);

        // Execute query
        const result = execute(`INSERT INTO tasks (id, user_id, title) VALUES (${idValue}, ${userId}, ${title});`);

        res.status(201).json({
            success: true,
            message: "Task created successfully.",
            data: { id: Number(idValue), user_id: Number(userId), title: req.body.title },
            result,
        });
    } catch (err) {
        next(err);
    }
}

function updateTask(req, res, next) {
    try {
        // Set active database
        useDemo();

        // Retrieve id, and fields to update
        const id = sqlInt(req.params.id);
        const updates = [];

        if (req.body.user_id !== undefined) {
            const userId = sqlInt(req.body.user_id);
            updates.push(`user_id = ${userId}`);
        }

        if (req.body.title !== undefined) {
            const title = sqlString(req.body.title);
            updates.push(`title = ${title}`);
        }

        if (updates.length === 0) {
            const err = new Error("No fields provided to update.");
            err.status = 400;
            throw err;
        }

        // Execute SQL query
        const result = execute(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ${id};`);

        // Handle the result
        const affected = parseAffected(result);
        if (affected === 0) {
            const err = new Error("Task not found.");
            err.status = 404;
            throw err;
        }

        res.status(200).json({
            success: true,
            message: "Task updated successfully.",
            data: {
                id: Number(id),
                ...(req.body.user_id !== undefined ? { user_id: Number(req.body.user_id) } : {}),
                ...(req.body.title !== undefined ? { title: req.body.title } : {}),
            },
            result,
        });
    } catch (err) {
        next(err);
    }
}

function deleteTask(req, res, next) {
    try {
        // Set active database
        useDemo();

        // Retrieve id
        const id = sqlInt(req.params.id);

        // Execute SQL query
        const result = execute(`DELETE FROM tasks WHERE id = ${id};`);

        // Handle result
        const affected = parseAffected(result);
        if (affected === 0) {
            const err = new Error("Task not found.");
            err.status = 404;
            throw err;
        }

        res.status(200).json({
            success: true,
            message: "Task deleted successfully.",
            data: { id: Number(id) },
            result,
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { listTasks, createTask, updateTask, deleteTask };
