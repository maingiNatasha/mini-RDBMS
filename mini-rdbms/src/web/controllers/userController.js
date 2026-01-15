const { execute, useDemo } = require("../services/rdbmsService");
const { sqlString, sqlInt } = require("../utils/sql");

function login(req, res, next) {
    try {
        // Set active database
        useDemo();

        // Retrieve email and password
        const email = sqlString(req.body.email);
        const password = sqlString(req.body.password);

        // Execute SQL query
        const result = execute(`SELECT id, email FROM users WHERE email = ${email} AND password = ${password};`);

        // Handle result
        const rows = Array.isArray(result) ? result : (result?.rows ?? result);
        if (rows === "(0 rows)" || rows.length === 0) {
            const err = new Error("Invalid email or password.");
            err.status = 401;
            throw err;
        }

        res.status(200).json({
            success: true,
            message: "Login successful.",
            data: rows[0],
        });
    } catch (err) {
        next(err);
    }
}

function register(req, res, next) {
    try {
        // Set active database
        useDemo();

        // Auto-generate id since the rdbms doesnt have auto-increment for columns
        let idValue;
        if (req.body.id !== undefined && req.body.id !== null) {
            idValue = sqlInt(req.body.id);
        } else {
            const idResult = execute("SELECT id FROM users;");
            const idRows = Array.isArray(idResult) ? idResult : (idResult?.rows ?? idResult);
            if (idRows === "(0 rows)") {
                idValue = "1";
            } else {
                const maxId = idRows.reduce((max, row) => Math.max(max, Number(row.id)), 0);
                idValue = String(maxId + 1);
            }
        }

        // Retrieve email and password
        const email = sqlString(req.body.email);
        const password = sqlString(req.body.password);

        // Execute SQL query
        const result = execute(`INSERT INTO users (id, email, password) VALUES (${idValue}, ${email}, ${password});`);

        res.status(201).json({
            success: true,
            message: "Registration successful.",
            data: { id: Number(idValue), email: req.body.email },
            result,
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { login, register };
