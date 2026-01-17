const { execute } = require("../../rdbms/engine");
const { db } = require("../../rdbms/dbManager");

// Boot once: load persisted state
function bootRdbms() {
    const loaded = db.loadFromDisk();
    if (loaded) console.log("Loaded database from disk.");
}

// Optional: create demo schema
function bootDemoSchema() {
    try { execute("CREATE DATABASE demo;"); } catch {}
    try { execute("USE demo;"); } catch {}
    try { execute("CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(50) UNIQUE, password VARCHAR(50));"); } catch {}
    try { execute("CREATE TABLE tasks (id INT PRIMARY KEY, user_id INT, title TEXT);"); } catch {}
}

// Helper to always use demo DB for this app
function useDemo() {
    execute("USE demo;");
}

module.exports = {
    execute,
    bootRdbms,
    bootDemoSchema,
    useDemo,
};
