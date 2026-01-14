/**
 * Represents a single database.
 * Owns tables, indexes, constraints, and CRUD logic.
 */

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

// Handles set intersection
function intersectSets(a, b) {
    // Iterate the smaller set for speed
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];

    const out = new Set();
    for (const x of small) {
        if (large.has(x)) out.add(x);
    }
    return out;
}

// Handles set union
function unionSets(out, s) {
    for (const x of s) {
        out.add(x);
    }
    return out;
}


class Database {
    constructor(name) {
        this.name = name
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
        // Return all RowIds if there is no where clause
        if (!where) return new Set(table.rowById.keys());

        // Step 1: Normalize input into: op + conditions[]
        let op = null;
        let conditions = null;

        if (where.op === "AND" || where.op === "OR") {
            op = where.op;
            conditions = where.conditions;
        } else {
            conditions = [where];
        }

        // Step 2: Convert each condition into a Set<rowId>
        const sets = conditions.map(({ column, value }) => {
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

            // Fallback scan for this condition
            const out = new Set();
            for (const row of table.rows) {
                const rowId = row._rowId;
                if (row[column] === coerced) out.add(rowId);
            }
            return out;
        });

        // Step 3: Combine the sets
        const totalRows = table.rowById.size;
        if (sets.length === 0) return new Set(); // edge case

        // OR = union (with early exit if we already have all rows)
        if (op === "OR") {
            const out = new Set();
            for (const s of sets) {
                unionSets(out, s);
                if (out.size === totalRows) return out; // can't get bigger than all rows
            }
            return out;
        }

        // AND (default): sort sets smallest-first, early exit when empty
        sets.sort((a, b) => a.size - b.size);

        let out = sets[0];
        if (out.size === 0) return out;

        for (let i = 1; i < sets.length; i++) {
            out = intersectSets(out, sets[i]);
            if (out.size === 0) return out;
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
            const rowIdSet = this._getMatchingRowIds(table, where, schemaByName);

            if (rowIdSet.size === 0) {
                rows = [];
            } else {
                rows = Array.from(rowIdSet).map((rowId) =>
                    table.rowById.get(rowId)
                );
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

    deleteRows(tableName, where) {
        // Check if table exists
        const table = this.getTable(tableName);
        if (!table) {
            throw new Error(`Table '${tableName}' does not exist`);
        }

        // Build a schema lookup
        const schemaByName = new Map(table.columns.map((column) => [column.name, column]));

        // Find rows to delete that match the WHERE clause
        const targetRowIds = this. _getMatchingRowIds(table, where, schemaByName);
        if (targetRowIds.size === 0) return 0;

        // Remove rows
        for (const rowId of targetRowIds) {
            const row = table.rowById.get(rowId);
            if (!row) continue;

            // Remove from indexes
            for (const colName of table.indexedColumns) {
                const val = row[colName];
                if (val !== null && val !== undefined) {
                    this._removeFromIndex(table, colName, val, rowId);
                }
            }

            // Remove from rowById
            table.rowById.delete(rowId);
        }

        // Remove from rows array
        table.rows = table.rows.filter(row => !targetRowIds.has(row._rowId));

        return targetRowIds.size;
    }

    toObject() {
        // Serialize database to plain object
        const tablesObj = {};

        for (const [name, table] of this.tables.entries()) {
            tablesObj[name] = {
                name: table.name,
                columns: table.columns,
                primaryKey: table.primaryKey ?? null,
                uniqueColumns: Array.from(table.uniqueColumns ?? []),
                indexedColumns: Array.from(table.indexedColumns ?? []),
                nextRowId: table.nextRowId ?? 1,
                rows: table.rows ?? [],
            };
        }

        return { tables: tablesObj };
    }

    static fromObject(dbName, data) {
        // Rebuild database from plain object
        const db = new Database(dbName);
        db.tables = new Map();

        const tablesData = data?.tables ?? {};

        for (const [tableName, tableObj] of Object.entries(tablesData)) {
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

            // Optional: if you also auto-index PK, keep it consistent
            if (table.primaryKey && !table.indexedColumns.has(table.primaryKey)) {
                table.indexedColumns.add(table.primaryKey);
            }

            // Initialize index maps
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

            // Populate indexes from existing rows
            for (const [rowId, row] of table.rowById.entries()) {
                db._indexRow(table, rowId, row);
            }

            db.tables.set(tableName, table);
        }

        return db;
    }
}

module.exports = { Database };