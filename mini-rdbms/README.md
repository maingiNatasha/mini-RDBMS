# Mini RDBMS (SQL-like REPL)

A small relational database management system implemented from scratch with a SQL-like interface and an interactive REPL.
It demonstrates core database concepts: parsing, schema enforcement, indexing, and query execution.

---

## Quick start

Requirements: Node.js (LTS recommended)

```bash
npm install
npm start
# or
node src/repl.js
```

Exit the REPL with `exit` or `quit`.

---

## Example session

```sql
CREATE DATABASE demo;
USE demo;

CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(50) UNIQUE,
  name TEXT
);

INSERT INTO users (id, email, name) VALUES (1, "tasha@b.com", "Natasha");
INSERT INTO users (id, email, name) VALUES (2, "alex@b.com", "Alex");

SELECT * FROM users;
SELECT id, email FROM users WHERE id = 2;
```

---

## SQL reference

### Databases

```sql
CREATE DATABASE db_name;
USE db_name;
```

- Names must match `[A-Za-z_][A-Za-z0-9_]*`.
- A database must be selected before table or data operations.

### Tables

```sql
CREATE TABLE users (
  id INT PRIMARY KEY,
  email VARCHAR(50) UNIQUE,
  name TEXT
);

CREATE TABLE tasks (
  id INT,
  user_id INT,
  title TEXT
) PRIMARY KEY (id);
```

- Supported types: `INT`, `TEXT`, `VARCHAR(n)`.
- `PRIMARY KEY` can be inline or table-level.
- `UNIQUE` is supported per column.
- Primary key and unique columns are auto-indexed.

### Inserts

```sql
INSERT INTO users (id, email, name) VALUES (1, "tasha@b.com", "Natasha");
```

- Column list is required.
- Strings can be single or double quoted.
- `NULL` is supported for non-primary-key columns.

### Selects

```sql
SELECT * FROM users;
SELECT id, email FROM users WHERE id = 2;
SELECT * FROM users WHERE id = 1 AND email = "tasha@b.com";
SELECT * FROM users WHERE id = 1 OR id = 2;
```

- `WHERE` supports equality only (`column = value`).
- Combine conditions with `AND` or `OR` (no parentheses).

### Updates

```sql
UPDATE users SET email = "natasha@b.com" WHERE id = 1;
UPDATE users SET email = "a@b.com", name = "Alex";
```

- `WHERE` is optional; without it, all rows are updated.

### Deletes

```sql
DELETE FROM users WHERE id = 2;
```

- `WHERE` is required.

### Joins

```sql
SELECT * FROM users JOIN tasks ON users.id = tasks.user_id;
SELECT users.email, tasks.title FROM users JOIN tasks ON users.id = tasks.user_id;
```

- Only `INNER JOIN` is supported.
- No table aliases.
- For column projection, use fully qualified names (`table.column`).

---

## Behavior notes and constraints

- Keywords are case-insensitive; identifiers are case-sensitive.
- Duplicate `PRIMARY KEY` or `UNIQUE` values are rejected.
- `UNIQUE` columns allow multiple `NULL` values.
- `SELECT *` on a join returns qualified keys to avoid collisions.
- Result of `SELECT` is an array of objects; empty results return `(0 rows)`.
- No `ORDER BY`, `GROUP BY`, `LIMIT`, `ALTER TABLE`, or `DROP TABLE`.

---

## Persistence

- Data is saved to `data.json` on every write (create, insert, update, delete).
- Databases are loaded from `data.json` on startup.

---

## Project layout

- `src/parser.js` parses SQL into an AST.
- `src/engine.js` executes AST nodes against the DB manager.
- `src/dbManager.js` manages multiple databases and persistence.
- `src/db.js` implements tables, indexes, constraints, and CRUD.
- `src/repl.js` provides the interactive shell.

---

## Development tips

- If you edit `data.json` manually, restart the REPL to reload data.
- Keep strings quoted in SQL input; unquoted strings are treated as identifiers.

---

## Acknowledgements

- Portions of development and documentation were assisted by AI tools (ChatGPT and Codex).


