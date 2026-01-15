/**
 * Database manager for the mini RDBMS.
 * Handles multiple databases, the active database context, and delegates operations to the selected Database.
 */

const fs = require("node:fs");
const path = require("node:path");
const { Database } = require("./db");

// File for storing db data in json format (pin to project root)
const DATA_FILE = path.join(__dirname, "..", "..", "data.json");

class DBManager {
    constructor() {
        this.databases = new Map(); // dbName -> Database
        this.currentDbName = null;
    }

    get currentDb() {
        if (!this.currentDbName) {
            throw new Error("No database selected. Use USE <database>.");
        }

        const db = this.databases.get(this.currentDbName);
        if (!db) {
            throw new Error(`Unknown database '${this.currentDbName}'`);
        }
        return db;
    }

    createDatabase(name) {
        if (this.databases.has(name)) {
            throw new Error(`Database '${name}' already exists`);
        }
        this.databases.set(name, new Database(name));
    }

    useDatabase(name) {
        if (!this.databases.has(name)) {
            throw new Error(`Unknown database '${name}'`);
        }
        this.currentDbName = name;
    }

    // Delegate table ops to selected DB
    createTable(tableName, columns, primaryKey) {
        return this.currentDb.createTable(tableName, columns, primaryKey);
    }

    insertRow(tableName, columns, values) {
        return this.currentDb.insertRow(tableName, columns, values);
    }

    selectRows(tableName, columns, where) {
        return this.currentDb.selectRows(tableName, columns, where);
    }

    updateRows(tableName, assignments, where) {
        return this.currentDb.updateRows(tableName, assignments, where);
    }

    deleteRows(tableName, where) {
        return this.currentDb.deleteRows(tableName, where);
    }

    selectJoin(leftTable, rightTable, on, columns) {
        return this.currentDb.selectJoin(leftTable, rightTable, on, columns)
    }

    saveToDisk(filepath = DATA_FILE) {
        const databasesObj = {};
        for (const [dbName, db] of this.databases.entries()) {
            databasesObj[dbName] = db.toObject();
        }

        const payload = {
            version: 1,
            currentDbName: this.currentDbName,
            databases: databasesObj,
        };

        fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), "utf8");
    }

    loadFromDisk(filepath = DATA_FILE) {
        if (!fs.existsSync(filepath)) return false;

        const raw = fs.readFileSync(filepath, "utf8");
        const data = JSON.parse(raw);

        this.databases = new Map();

        const dbs = data.databases ?? {};
        for (const [dbName, dbObj] of Object.entries(dbs)) {
            this.databases.set(dbName, Database.fromObject(dbName, dbObj));
        }

        this.currentDbName = data.currentDbName ?? null;
        if (this.currentDbName && !this.databases.has(this.currentDbName)) {
            this.currentDbName = null;
        }

        return true;
    }
}

// Single manager instance for the whole app
const db = new DBManager();

module.exports = { db }
