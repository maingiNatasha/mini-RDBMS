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

    _createIndexOnTable(table, colName) {
        // Check if column exists in indexed columns
        if (table.indexedColumns.has(colName)) return;

        // Register column as indexed
        table.indexedColumns.add(colName);
        table.indexes.set(colName, new Map());
    }

    _indexRow(table, rowId, row) {
        for (const colName of table.indexedColumns) {
            // Check if row has indexed column
            if (!(colName in row)) continue;

            // Get value in that column
            const val = row[colName];
            if (val === null) continue;

            // Get index map for column
            const colIndex = table.indexes.get(colName);

            // If it doesn't have a value, add val and create a set
            if (!colIndex.has(val)) {
                colIndex.set(val, new Set());
            }

            // Add row id in set
            colIndex.get(val).add(rowId);
        }
    }

    _removeFromIndex(table, colName, val, rowId) {
        // Get column index
        const colIndex = table.indexes.get(colName);
        if (!colIndex) return;

        // Get set for the specific value
        const set = colIndex.get(val);
        if (!set) return;

        // Remove row id from set
        set.delete(rowId);

        // Clean up empty sets
        if (set.size === 0) colIndex.delete(val);
    }

    _addToIndex(table, colName, val, rowId) {
        // Get column index
        const colIndex = table.indexes.get(colName);
        if (!colIndex) return;

        // Create set if val doesn't exist
        if (!colIndex.has(val)) colIndex.set(val, new Set());

        // Add row id to set
        colIndex.get(val).add(rowId);
    }

    _getMatchingRowIds(table, where, schemaByName) {
        const { column, value } = where;

        if (!schemaByName.has(column)) {
            throw new Error(`Unknown column '${column}' in table '${table.name}'`);
        }

        const coerced = coerceValue(schemaByName.get(column), value);

        // Use index if available
        if (table.indexedColumns.has(column)) {
            const index = table.indexes.get(column);
            const set = index?.get(coerced);
            return new Set(set ? Array.from(set) : []);
        }

        // Fallback scan
        const out = new Set();
        for (const row of table.rows) {
            const rowId = row._rowId;
            if (row[column] === coerced) out.add(rowId);
        }
        return out;
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

        const table = {
            name,
            columns,
            primaryKey,
            uniqueColumns,
            rows: [],
            nextRowId: 1,
            rowById: new Map(),
            indexedColumns: new Set(),
            indexes: new Map(),
        };

        // Auto-create indexes for unique columns (PK + UNIQUE)
        for (const colName of uniqueColumns) {
            this._createIndexOnTable(table, colName);
        }

        this.tables.set(name, table);
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

        // Step 5: Constraint enforcement (PK + UNIQUE) using indexes
        for (const uniqueCol of table.uniqueColumns) {
            // If user didn’t provide a unique column, skip for now.
            if (!(uniqueCol in newRow)) continue;

            const incoming = newRow[uniqueCol];

            // Allow multiple NULLs for UNIQUE
            if (incoming === null) continue;

            // Index must exist for unique columns (created at CREATE TABLE / rebuilt on load)
            const index = table.indexes.get(uniqueCol);
            if (!index) {
                throw new Error(`Index missing for unique column '${uniqueCol}'`);
            }

            const existing = index.get(incoming);
            if (existing && existing.size > 0) {
                if (table.primaryKey === uniqueCol) {
                    throw new Error(
                        `Duplicate PRIMARY KEY value for '${uniqueCol}': ${incoming}`
                    );
                }
                throw new Error(`Duplicate UNIQUE value for '${uniqueCol}': ${incoming}`);
            }
        }

        // Step 6: Commit the row after passing checks
        // Assign internal rid
        const rowId = table.nextRowId++;
        newRow._rowId = rowId;

        table.rows.push(newRow);
        table.rowById.set(rowId, newRow);

        // Index it
        this._indexRow(table, rowId, newRow);

        return 1; // affected rows
    }

    selectRows(tableName, columns, where = null) {
        // Step 1: Find the table
        const table = this.getTable(tableName);

        // Check if table exists
        if (!table) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // Step 2: Build a schema lookup
        const schemaByName = new Map(table.columns.map((column) => [column.name, column]));

        // Step 3: Validate column names
        if (columns !== "*") {
            for (const col of columns) {
                if (!schemaByName.has(col)) {
                    throw new Error(`Unknown column '${colName}' in table '${tableName}'`);
                }
            }
        }

        // Step 4: Filter rows
        // Start with all rows
        let rows = table.rows;

        // Apply WHERE col = value (optional)
        if (where) {
            const { column, value } = where;

            if (!schemaByName.has(column)) {
                throw new Error(`Unknown column '${column}' in table '${tableName}'`);
            }

            const colDef = schemaByName.get(column);
            const coerced = coerceValue(colDef, value);

            // If we have an index on this column, use it
            if (table.indexedColumns.has(column)) {
                const index = table.indexes.get(column);
                const rowIdSet = index.get(coerced);

                if (!rowIdSet || rowIdSet.size === 0) {
                    rows = [];
                } else {
                    rows = Array.from(rowIdSet).map((rowId) => table.rowById.get(rowId));
                }

                console.log("[INDEX USED]", column);
            } else {
                // Fallback scan
                rows = rows.filter((row) => row[column] === coerced);

                console.log("[FALLBACK SCAN USED]", column);
            }
        }

        // Step 5: Return only requested columns
        // SELECT *
        if (columns === "*") {
            return rows;
        }

        // SELECT columns
        return rows.map(row => {
            const projected = {};

            for (const col of columns) {
                projected[col] = row[col];
            }

            return projected;
        });
    }

    updateRows(tableName, assignments, where) {
        // Check if table exists
        const table = this.getTable(tableName);
        if (!table) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // Build a schema lookup
        const schemaByName = new Map(table.columns.map((column) => [column.name, column]));

        // Validate SET columns exist
        for (const a of assignments) {
            if (!schemaByName.has(a.column)) {
                throw new Error(`Unknown column '${a.column}' in table '${tableName}'`);
            }
        }

        // Find target rows
        const targetRowIds = this._getMatchingRowIds(table, where, schemaByName);
        if (targetRowIds.size === 0) return 0;

        // Pre-coerce new values once (based on schema)
        const coercedAssignments = assignments.map((a) => ({
            column: a.column,
            value: coerceValue(schemaByName.get(a.column), a.value),
        }));

        // For uniqueness checks, we will use indexes if present
        const isUniqueCol = (col) => table.uniqueColumns.has(col);

        let updated = 0;

        for (const rowId of targetRowIds) {
            const row = table.rowById.get(rowId);
            if (!row) continue;

            // ---- Uniqueness pre-checks for THIS row (before mutating) ----
            for (const a of coercedAssignments) {
                if (!isUniqueCol(a.column)) continue;

                const incoming = a.value;
                if (incoming === null) continue;

                const index = table.indexes.get(a.column);
                const existingSet = index?.get(incoming);

                if (existingSet && existingSet.size > 0) {
                    // conflict only if some OTHER row already has this value
                    const onlyMe = existingSet.size === 1 && existingSet.has(rowId);

                    if (!onlyMe) {
                        if (table.primaryKey === a.column) {
                            throw new Error(`Duplicate PRIMARY KEY value for '${a.column}': ${incoming}`);
                        }
                        throw new Error(`Duplicate UNIQUE value for '${a.column}': ${incoming}`);
                    }
                }
            }

            // ---- Apply updates + maintain indexes ----
            for (const a of coercedAssignments) {
                const col = a.column;
                const newVal = a.value;

                const oldVal = row[col];

                // If no change, skip
                if (oldVal === newVal) continue;

                // If this column is indexed, update index buckets
                if (table.indexedColumns.has(col)) {
                    if (oldVal !== null && oldVal !== undefined) {
                        this._removeFromIndex(table, col, oldVal, rowId);
                    }

                    if (newVal !== null && newVal !== undefined) {
                        this._addToIndex(table, col, newVal, rowId);
                    }
                }

                // Mutate row
                row[col] = newVal;
            }

            updated++;
        }

        return updated;
    }

    loadFromDisk(filepath = DATA_FILE) {
        if (!fs.existsSync(filepath)) return false;

        const raw = fs.readFileSync(filepath, "utf8");
        const data = JSON.parse(raw);

        this.tables = new Map();

        for (const [tableName, tableObj] of Object.entries(data.tables)) {
            // Recreate the table object (schema + rows)
            const table = {
                name: tableObj.name,
                columns: tableObj.columns,
                primaryKey: tableObj.primaryKey ?? null,
                uniqueColumns: new Set(tableObj.uniqueColumns ?? []),
                rows: tableObj.rows ?? [],
                nextRowId: tableObj.nextRowId ?? 1,
                rowById: new Map(),
                indexedColumns: new Set(tableObj.indexedColumns ?? []),
                indexes: new Map(),
            };

            // Ensure PK/UNIQUE columns are indexed (auto-index rule)
            for (const colName of table.uniqueColumns) {
                if (!table.indexedColumns.has(colName)) {
                    table.indexedColumns.add(colName);
                }
            }

            // Initialize index maps for indexed columns
            for (const colName of table.indexedColumns) {
                table.indexes.set(colName, new Map());
            }

            // Rebuild rowById from rows
            for (const row of table.rows) {
                const rowId = row._rowId;
                if (typeof rowId === "number") {
                    table.rowById.set(rowId, row);
                }
            }

            // Populate indexes from existing rows (single pass)
            for (const [rowId, row] of table.rowById.entries()) {
                this._indexRow(table, rowId, row);
            }

            this.tables.set(tableName, table);
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
                indexedColumns: Array.from(table.indexedColumns ?? []),
                nextRowId: table.nextRowId ?? 1,
                rows: table.rows ?? [],
            };

        }

        fs.writeFileSync(filepath, JSON.stringify({ tables: tablesObj }, null, 2), "utf8");
    }

}

// Create a single database instance in memory
const db = new Database();

module.exports = { db };