/**
 * SQL parser for the mini RDBMS.
 * Converts supported SQL statements into an abstract syntax tree (AST).
 */

function splitCSV(input) {
    // Splits by commas, but respects quoted strings: "a,b" or 'a,b'
    const output = [];
    let buf = "";
    let inQuote = false;
    let quoteChar = null;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];

        if ((ch === "'" || ch === '"') && !inQuote) {
            inQuote = true;
            quoteChar = ch;
            buf += ch;
            continue;
        }

        if (inQuote && ch === quoteChar) {
            inQuote = false;
            quoteChar = null;
            buf += ch;
            continue;
        }

        if (!inQuote && ch === ",") {
            output.push(buf.trim());
            buf = "";
            continue;
        }

        buf += ch;
    }

    if (buf.trim().length > 0) {
        output.push(buf.trim());
    }

    return output;
}

function parseColumnType(typeToken) {
    const token = typeToken.toUpperCase();

    // Support VARCHAR(50)
    const varcharMatch = token.match(/^VARCHAR\((\d+)\)$/);
    if (varcharMatch) {
        return { baseType: "VARCHAR", length: Number(varcharMatch[1]) };
    }

    // Support INT, TEXT (extend later)
    return { baseType: token, length: null };
}

function parseWhere(wherePart) {
    // Supports:
    // "email = 'tasha@b.com' AND id = 1"
    // "email = 'tasha@b.com' OR id = 1"
    const trimmed = wherePart.trim();

    // Detect operator type used
    const hasAnd = /\s+AND\s+/i.test(trimmed);
    const hasOr  = /\s+OR\s+/i.test(trimmed);

    if (hasAnd && hasOr) {
        throw new Error("Mixed AND/OR without parentheses is not supported yet. " + "Stick to only ANDs or only ORs.");
    }

    // Retrieve operator and parts
    const op = hasOr ? "OR" : (hasAnd ? "AND" : null);
    const parts = op ? trimmed.split(new RegExp(`\\s+${op}\\s+`, "i")) : [trimmed];

    const conditions = parts.map((part) => {
        const m = part.trim().match(/^(\w+)\s*=\s*(.+)$/);
        if (!m) throw new Error("Invalid WHERE clause");

        return {
            column: m[1].trim(),
            value: m[2].trim()
        };
    });

    return conditions.length === 1
        ? conditions[0]
        : { op, conditions };
}

function parseCreateDatabase(cleaned) {
    // Supports:
    // CREATE DATABASE test_db;
    const createDBregex = /^CREATE\s+DATABASE\s+([A-Za-z_][A-Za-z0-9_]*);$/i;
    const match = cleaned.match(createDBregex);

    if (!match) return null;

    const dbName = match[1];

    return { type: "CREATE_DATABASE", dbName }
}

function parseUseDatabase(cleaned) {
    // Supports:
    // USE test_db;
    const useeDBregex = /^USE\s+([A-Za-z_][A-Za-z0-9_]*);$/i;
    const match = cleaned.match(useeDBregex);

    if (!match) return null;

    const dbName = match[1];

    return { type: "USE_DATABASE", dbName }
}

function parseCreateTable(cleaned) {
    // Supports:
    // Inline PK: CREATE TABLE users (id INT PRIMARY KEY, username TEXT);
    // Table-level PK: CREATE TABLE tasks (id INT, user_id INT, title TEXT) PRIMARY KEY (id);
    const createTableRegex = /^CREATE\s+TABLE\s+(\w+)\s*\((.+?)\)\s*(?:PRIMARY\s+KEY\s*\((\w+)\))?\s*;\s*$/i;

    const match = cleaned.match(createTableRegex);
    if (!match) return null;

    const tableName = match[1];
    const columnsPart = match[2];
    const tableLevelPk = match[3] ?? null;

    let primaryKey = null;

    const columns = columnsPart.split(",").map((colDef) => {
        const tokens = colDef.trim().split(/\s+/);

        if (tokens.length < 2) {
            throw new Error("Invalid column definition");
        }

        const name = tokens[0];
        const typeInfo = parseColumnType(tokens[1]);

        const upperTokens = tokens.map((t) => t.toUpperCase());

        // Inline PRIMARY KEY detection: "id INT PRIMARY KEY"
        const hasInlinePK = upperTokens.includes("PRIMARY") && upperTokens.includes("KEY") && upperTokens.indexOf("PRIMARY") + 1 === upperTokens.indexOf("KEY");

        if (hasInlinePK) {
            if (primaryKey && primaryKey !== name) {
                throw new Error("Only one PRIMARY KEY is supported");
            }
            primaryKey = name;
        }

        const isUnique = upperTokens.includes("UNIQUE");

        return {
            name,
            type: typeInfo.baseType,
            length: typeInfo.length,
            primaryKey: hasInlinePK,
            unique: isUnique,
        };
    });

    // Apply table-level PRIMARY KEY (if provided)
    if (tableLevelPk) {
        if (primaryKey && primaryKey !== tableLevelPk) {
            throw new Error("Only one PRIMARY KEY is supported");
        }

        // Ensure PK column exists
        const pkCol = columns.find((c) => c.name === tableLevelPk);
        if (!pkCol) {
            throw new Error(`PRIMARY KEY column '${tableLevelPk}' does not exist`);
        }

        primaryKey = tableLevelPk;

        // Mark it as primaryKey on that column too (so your DB can treat it like inline)
        pkCol.primaryKey = true;
    }

    return {
        type: "CREATE_TABLE",
        tableName,
        columns,
        primaryKey,
    };
}

function parseInsert(cleaned) {
    // Supports:
    // INSERT INTO users (id, username) VALUES (1, 'Natasha');
    const insertRegex =  /^INSERT\s+INTO\s+(\w+)\s*\((.+?)\)\s*VALUES\s*\((.+?)\)\s*;\s*$/i;
    const match = cleaned.match(insertRegex);

    if (!match) return null;

    const tableName = match[1];
    const columnsPart = match[2];
    const valuesPart = match[3];

    // Retrieve columns and values
    const columns = splitCSV(columnsPart).map((col) => col.trim());
    const values = splitCSV(valuesPart).map((value) => value.trim());

    if (columns.length !== values.length) {
        throw new Error("Columns count must match values count");
    }

    return {
        type: "INSERT",
        tableName,
        columns,
        values, // still raw strings
    };
}

function parseSelect(cleaned) {
    // Supports:
    // SELECT * FROM users;
    // SELECT id, email FROM users;
    // SELECT * FROM users WHERE id = 1;
    // SELECT * FROM users WHERE id = 1 AND username = "Natasha";
    const selectRegex = /^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?\s*;\s*$/i;
    const match = cleaned.match(selectRegex);

    if (!match) return null;

    const columnsPart = match[1].trim();
    const tableName = match[2];
    const where = match[3] ? parseWhere(match[3].trim()) : null;

    // Retrieve columns
    let columns;

    if (columnsPart === "*") {
        columns = "*";
    } else {
        columns = columnsPart.split(",").map(col => col.trim());
    }

    return {
        type: "SELECT",
        tableName,
        columns,
        where
    };
}

function parseUpdate(cleaned) {
    // Supports:
    // UPDATE users SET username = 'Natasha' WHERE id = 1;
    // UPDATE users SET email = 'natasha@yahoo.com', username = 'Tash' WHERE id = 2;
    // UPDATE users SET email = 'natasha@yahoo.com', username = 'Tash' WHERE id = 2 AND username = "Natasha";
    const updateRegex = /^UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+?))?\s*;\s*$/i;

    const match = cleaned.match(updateRegex);
    if (!match) return null;

    const tableName = match[1];
    const setPart = match[2].trim();
    const where = match[3] ? parseWhere(match[3].trim()) : null;

    // Split SET clause
    const assignments = splitCSV(setPart).map((piece) => {
        const m = piece.match(/^(\w+)\s*=\s*(.+)$/);
        if (!m) throw new Error("Invalid SET clause");
        return { column: m[1].trim(), value: m[2].trim() };
    });

    return {
        type: "UPDATE",
        tableName,
        assignments, // [{column, value}, ...]
        where
    };
}

function parseDelete(cleaned) {
    // Supports:
    // DELETE FROM users WHERE id = 1;
    // DELETE FROM users WHERE id = 2 AND username = "Tasha";
    const deleteRegex = /^DELETE\s+FROM\s+(\w+)\s+WHERE\s+(.+?)\s*;\s*$/i;

    const match = cleaned.match(deleteRegex);
    if (!match) return null;

    const tableName = match[1];
    const where = match[2] ? parseWhere(match[2].trim()) : null;

    return { type: "DELETE", tableName, where };
}

function parseSelectJoin(cleaned) {
    // Supports:
    // SELECT * FROM users JOIN tasks ON users.id = tasks.user_id;
    // SELECT users.email, tasks.title FROM users JOIN tasks ON users.id = tasks.user_id;
    const selectJoinRegex = /^SELECT\s+(.+?)\s+FROM\s+(\w+)\s+JOIN\s+(\w+)\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)\s*;\s*$/i;

    const match = cleaned.match(selectJoinRegex);
    if (!match) return null;

    const columnsPart = match[1].trim();
    const leftTable = match[2];
    const rightTable = match[3];
    const left = { table: match[4], column: match[5] };
    const right = { table: match[6], column: match[7] };

    // Retrieve columns
    let columns;

    if (columnsPart === "*") {
        columns = "*";
    } else {
        columns = columnsPart.split(",").map(col => col.trim());
    }

    return {
        type: "SELECT_JOIN",
        columns,
        leftTable,
        rightTable,
        on : { left, right }
    };

}

function parse(sql) {
    const cleaned = sql.trim();

    const createDatabaseAST = parseCreateDatabase(cleaned);
    if (createDatabaseAST) return createDatabaseAST;

    const useDatabaseAST = parseUseDatabase(cleaned);
    if (useDatabaseAST) return useDatabaseAST;

    const createAST = parseCreateTable(cleaned);
    if (createAST) return createAST;

    const insertAST = parseInsert(cleaned);
    if (insertAST) return insertAST;

    const selectAST = parseSelect(cleaned);
    if (selectAST) return selectAST;

    const updateAST = parseUpdate(cleaned);
    if (updateAST) return updateAST;

    const deleteAST = parseDelete(cleaned);
    if (deleteAST) return deleteAST;

    const joinAST = parseSelectJoin(cleaned);
    if (joinAST) return joinAST;

    throw new Error("Invalid or unsupported SQL syntax");
}

module.exports = { parse };