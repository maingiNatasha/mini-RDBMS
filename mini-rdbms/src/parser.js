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
    // Check syntax eg: SELECT (id, name) FROM users; / SELECT * FROM users;
    const selectRegex = /^SELECT\s+(.+)\s+FROM\s+(\w+)\s*;?$/i;
    const match = cleaned.match(selectRegex);

    if (!match) return null;

    const columnsPart = match[1].trim();
    const tableName = match[2];

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
        columns
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

    throw new Error("Invalid or unsupported SQL syntax");
}

module.exports = { parse };