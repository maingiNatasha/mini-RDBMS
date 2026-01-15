const express = require("express");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");

const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Routes
app.use("/api/auth", userRoutes);
app.use("/api/task", taskRoutes);

// Basic JSON error handler for controllers calling next(err)
app.use((err, req, res, next) => {
    const status = err.statusCode || err.status || 500;
    res.status(status).json({
        success: false,
        message: err.message || "Internal Server Error",
    });
});

module.exports = app;
