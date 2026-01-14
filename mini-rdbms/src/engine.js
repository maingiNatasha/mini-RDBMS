/**
 * Execution engine for the mini RDBMS.
 * Connects parsed SQL (AST) to database operations.
 */

const { parse } = require("./parser");
const { db } = require("./dbManager");

function execute(sql) {
    // Parse SQL
    const ast = parse(sql);
    // console.log("AST:", ast);

    // Carry out the command based on AST type
    switch (ast.type) {
        case "CREATE_DATABASE":
            db.createDatabase(ast.dbName);
            db.saveToDisk();
            return `Database '${ast.dbName}' created`;

        case "USE_DATABASE":
            db.useDatabase(ast.dbName);
            db.saveToDisk();
            return `Using database '${ast.dbName}'`;

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
            const rows = db.selectRows(ast.tableName, ast.columns, ast.where);
            if (rows.length === 0) return "(0 rows)";
            return rows;
        }

        case "UPDATE": {
            const affected = db.updateRows(ast.tableName, ast.assignments, ast.where);
            db.saveToDisk();
            return `${affected} row(s) updated in '${ast.tableName}'`;
        }

        case "DELETE": {
            const affected = db.deleteRows(ast.tableName, ast.where);
            db.saveToDisk();
            return `${affected} row(s) deleted from '${ast.tableName}'`;
        }

        default:
            throw new Error("Unsupported command");
    }
}

module.exports = { execute };