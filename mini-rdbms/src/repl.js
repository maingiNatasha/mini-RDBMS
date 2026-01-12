/**
 * Interactive REPL for the mini RDBMS.
 * Reads SQL commands from stdin, executes them, and prints results.
 */

// readline - Reads user input from the terminal; execute - runs SQL commands
const readline = require("readline");
const { execute } = require("./engine");
const { db } = require("./db");

// Load stored database data
const loaded = db.loadFromDisk();
if (loaded) console.log("Loaded database from disk.");

// Create interface
const repl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "RDBMS> "
});

// Print greeting and show the prompt
console.log("Welcome to the RDBMS. Type 'exit' to quit.")
repl.prompt();

repl.on("line", (line) => {
    const input = line.trim();

    // Close prompt on exit
    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        repl.close();
        return;
    }

    // Execute SQL commands
    try {
        const result = execute(input);
        if (result !== undefined) {
            console.log(result);
        }

    } catch (error) {
        console.error("Error", error.message);
    }

    // Show propmt for user to type the next command
    repl.prompt();
});

// Handles interface close/exit
repl.on("close", () => {
    console.log("Bye!");
    process.exit(0);
});