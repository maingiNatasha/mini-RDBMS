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

function parseCreateTable(cleaned) {
    // Check syntax eg: CREATE TABLE users (id INT, name TEXT);
    const createTableregex = /^CREATE TABLE (\w+)\s*\((.+)\);?$/i;
    const match = cleaned.match(createTableregex);

    if (!match) return null;

    const tableName = match[1]; // Retrieve table name
    const columnsPart  = match[2]; // Retrieve columns part

    let primaryKey = null;

    const columns = columnsPart.split(",").map(colDef => {
        const tokens = colDef.trim().split(/\s+/);

        // Check if it contains atleast col name and col type
        if (tokens.length < 2) {
            throw new Error("Invalid column definition");
        }

        // Retrieve column name and column type
        const name = tokens[0];
        const typeInfo = parseColumnType(tokens[1]);

        // Convert tokens to upper case
        const upperTokens = tokens.map(t => t.toUpperCase());

        // PRIMARY KEY detection
        const hasPrimaryKey = upperTokens.includes("PRIMARY") && upperTokens.includes("KEY") && upperTokens.indexOf("PRIMARY") + 1 === upperTokens.indexOf("KEY");

        if (hasPrimaryKey) {
            // Check if primary key already exists
            if (primaryKey && primaryKey !== name) {
                throw new Error("Only one PRIMARY KEY is supported");
            }

            primaryKey = name;
        }

        // UNIQUE detection
        const isUnique = upperTokens.includes("UNIQUE");

        return {
            name,
            type: typeInfo.baseType, // "INT" | "TEXT" | "VARCHAR"
            length: typeInfo.length, // number | null (only for VARCHAR)
            primaryKey: hasPrimaryKey,
            unique: isUnique
        };
    });

    // Return AST
    return {
        type: "CREATE_TABLE",
        tableName,
        columns,
        primaryKey
    };
}

function parseInsert(cleaned) {
    // Check syntax eg: INSERT INTO users (id, name) VALUES (1, 'Natasha');
    const insertRegex = /^INSERT INTO (\w+)\s*\((.+)\)\s*VALUES\s*\((.+)\)\s*;?$/i;
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
    const selectRegex = /^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(\w+)\s*=\s*(.+?))?\s*;?$/i;
    const match = cleaned.match(selectRegex);

    if (!match) return null;

    const columnsPart = match[1].trim();
    const tableName = match[2];

    const whereCol = match[3] ? match[3].trim() : null;
    let whereVal = match[4] ? match[4].trim() : null;

    // If value captured includes a trailing semicolon, strip it
    if (whereVal && whereVal.endsWith(";")) {
        whereVal = whereVal.slice(0, -1).trim();
    }

    // Retrieve columns
    let columns;

    if (columnsPart === "*") {
        columns = "*";
    } else {
        columns = columnsPart.split(",").map(col => col.trim());
    }

    const where = whereCol ? { column: whereCol, value: whereVal } : null;

    return {
        type: "SELECT",
        tableName,
        columns,
        where
    };
}

function parseUpdate(cleaned) {
    // Supports:
    // UPDATE users SET name = 'Natasha' WHERE id = 1;
    // UPDATE users SET email = 'natasha@yahoo.com', name = 'Tash' WHERE id = 2;
    const updateRegex = /^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(\w+)\s*=\s*(.+?)\s*;?$/i;

    const match = cleaned.match(updateRegex);
    if (!match) return null;

    const tableName = match[1];
    const setPart = match[2].trim();
    const whereCol = match[3].trim();
    let whereVal = match[4].trim();

    // If value captured includes a trailing semicolon, strip it
    if (whereVal && whereVal.endsWith(";")) {
        whereVal = whereVal.slice(0, -1).trim();
    }

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
        where: { column: whereCol, value: whereVal },
    };
}

function parse(sql) {
    const cleaned = sql.trim();

    const createAST = parseCreateTable(cleaned);
    if (createAST) return createAST;

    const insertAST = parseInsert(cleaned);
    if (insertAST) return insertAST;

    const selectAST = parseSelect(cleaned);
    if (selectAST) return selectAST;

    const updateAST = parseUpdate(cleaned);
    if (updateAST) return updateAST;

    throw new Error("Invalid or unsupported SQL syntax");
}

module.exports = { parse };