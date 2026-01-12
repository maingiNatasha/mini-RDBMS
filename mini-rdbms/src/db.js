/**
 * In-memory database state for the mini RDBMS.
 * Manages table schemas, row storage and constraints.
 */

const fs = require("node:fs");
const path = require("node:path");

// File for storing db data in json format
const DATA_FILE = path.join(process.cwd(), "data.json");


// Removes quotes from values
function stripQuotes(value) {
    const v = value.trim();

    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        return v.slice(1, -1);
    }

    return v;
}

// Converts value to column type
function coerceValue(columnDef, rawValue) {
    // Handle NULL (optional)
    if (rawValue.toUpperCase() === "NULL") return null;

    const type = columnDef.type;
    const val = stripQuotes(rawValue);

    if (type === "INT") {
        const num = Number(val);

        if (!Number.isInteger(num)) {
            throw new Error(`Invalid INT value for column '${columnDef.name}'`);
        }
        return num;
    }

    if (type === "TEXT") {
        return val;
    }

    if (type === "VARCHAR") {
        if (typeof columnDef.length !== "number") {
            throw new Error(`VARCHAR length not defined for column '${columnDef.name}'`);
        }

        if (val.length > columnDef.length) {
            throw new Error(
                `Value too long for column '${columnDef.name}' (max ${columnDef.length})`
            );
        }
        return val;
    }

    throw new Error(`Unsupported column type '${type}'`);
}

class Database {
    constructor() {
        this.tables = new Map();
    }

    createTable(name, columns, primaryKey = null) {
        // Check if table already exists
        if (this.tables.has(name)) {
            throw new Error(`Table '${name}' already exists`);
        }

        // Prevent duplicate column names and store unique columns
        const seen = new Set();
        const uniqueColumns = new Set();

        for (const col of columns) {
            if (seen.has(col.name)) {
                throw new Error(`Duplicate column '${col.name}'`);
            }
            seen.add(col.name);

            if (col.unique) {
                uniqueColumns.add(col.name);
            }
        }

        // Ensure the primary key column exists
        if (primaryKey && !columns.some(col => col.name === primaryKey)) {
            throw new Error(`PRIMARY KEY column '${primaryKey}' not found`);
        }

        // Treat primary key as unique
        if (primaryKey) {
            uniqueColumns.add(primaryKey);
        }

        this.tables.set(name, {
            name,
            columns,
            primaryKey,
            uniqueColumns,
            rows: []
        });
    }

    getTable(name) {
        return this.tables.get(name);
    }

    insertRow(tableName, columnNames, rawValues) {
        // Step 1: Find the table
        const table = this.getTable(tableName);

        // Check if table exists
        if (!table) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // Step 2: Build a schema lookup
        const schemaByName = new Map(table.columns.map((column) => [column.name, column]));

        // Step 3: Validate column names
        for (const colName of columnNames) {
            if (!schemaByName.has(colName)) {
                throw new Error(`Unknown column '${colName}' in table '${tableName}'`);
            }
        }

        // Step 4: Build new row object (only provided columns for now)
        const newRow = {};

        for (let i = 0; i < columnNames.length; i++) {
            const colName = columnNames[i];
            const colDef = schemaByName.get(colName);
            newRow[colName] = coerceValue(colDef, rawValues[i]);
        }

        // Step 5: Constraint enforcement (PK + UNIQUE)
        for (const uniqueCol of table.uniqueColumns) {
            // If user didn’t provide a unique column, skip for now.
            if (!(uniqueCol in newRow)) continue;

            const incoming = newRow[uniqueCol];

            // If NULL, typical SQL UNIQUE allows multiple NULLs. We'll allow it.
            if (incoming === null) continue;

            // Detect conflicts
            const conflict = table.rows.some((rows) => rows[uniqueCol] === incoming);

            if (conflict) {
                // Differentiate PK vs UNIQUE in messaging
                if (table.primaryKey === uniqueCol) {
                    throw new Error(`Duplicate PRIMARY KEY value for '${uniqueCol}': ${incoming}`);
                }

                throw new Error(`Duplicate UNIQUE value for '${uniqueCol}': ${incoming}`);
            }
        }

        // Step 6: Persist/Insert the row
        table.rows.push(newRow);
        return 1; // affected rows
    }

    selectRows(tableName, columns) {
        // Step 1: Find the table
        const table = this.getTable(tableName);

        // Check if table exists
        if (!table) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // Handle SELECT *
        if (columns === "*") {
            return table.rows;
        }

        // Step 2: Validate requested columns
        const columnSet = new Set(table.columns.map(col => col.name));
        for (const col of columns) {
            if (!columnSet.has(col)) {
                throw new Error(`Unknown column '${col}' in table '${tableName}'`);
            }
        }

        // Step 3: Return only requested columns
        return table.rows.map(row => {
            const projected = {};

            for (const col of columns) {
                projected[col] = row[col];
            }

            return projected;
        });
    }

    loadFromDisk(filepath = DATA_FILE) {
        if (!fs.existsSync(filepath)) return false;

        const raw = fs.readFileSync(filepath, "utf8");
        const data = JSON.parse(raw);

        this.tables = new Map();

        for (const [tableName, tableObj] of Object.entries(data.tables)) {
            this.tables.set(tableName, {
            name: tableObj.name,
            columns: tableObj.columns,
            primaryKey: tableObj.primaryKey ?? null,
            uniqueColumns: new Set(tableObj.uniqueColumns ?? []),
            rows: tableObj.rows ?? [],
            });
        }

        return true;
    }

    saveToDisk(filepath = DATA_FILE) {
        const tablesObj = {};

        for (const [name, table] of this.tables.entries()) {
            tablesObj[name] = {
            name: table.name,
            columns: table.columns,
            primaryKey: table.primaryKey,
            uniqueColumns: Array.from(table.uniqueColumns ?? []),
            rows: table.rows,
            };
        }

        fs.writeFileSync(filepath, JSON.stringify({ tables: tablesObj }, null, 2), "utf8");
    }

}

// Create a single database instance in memory
const db = new Database();

module.exports = { db };