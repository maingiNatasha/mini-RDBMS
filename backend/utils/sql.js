function escapeString(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function sqlString(s) {
    if (s === undefined || s === null) throw new Error("Missing string value");
    return `"${escapeString(s)}"`;
}

function sqlInt(n) {
    const x = Number(n);
    if (!Number.isInteger(x)) throw new Error("Expected integer");
    return String(x);
}

module.exports = { sqlString, sqlInt };
