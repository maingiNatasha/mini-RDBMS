/**
 * Execution engine for the mini RDBMS.
 * Connects parsed SQL (AST) to database operations.
 */

const { parse } = require("./parser");
const { db } = require("./db");

function execute(sql) {
    // Parse SQL
    const ast = parse(sql);
    console.log("AST:", ast);

    // Carry out the command based on AST type
    switch (ast.type) {
        case "CREATE_TABLE":
            db.createTable(ast.tableName, ast.columns, ast.primaryKey);
            db.saveToDisk();
            return `Table '${ast.tableName}' created` + (ast.primaryKey ? ` (PK: ${ast.primaryKey})` : "None");

        case "INSERT": {
            const affected = db.insertRow(ast.tableName, ast.columns, ast.values);
            db.saveToDisk();
            return `${affected} row inserted into '${ast.tableName}'`;
        }

        case "SELECT": {
            const rows = db.selectRows(ast.tableName, ast.columns);

            if (rows.length === 0) {
                return "(0 rows)";
            }

            return rows;
        }

        default:
            throw new Error("Unsupported command");
    }
}

module.exports = { execute };