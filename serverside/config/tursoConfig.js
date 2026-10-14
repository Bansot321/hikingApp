
//tursoConfig.js
const path = require("path");
const dotenv = require("dotenv");
const { createClient } = require("@libsql/client");

dotenv.config({
  path: path.resolve(__dirname, "../.env"),
});

const { TURSO_DB_URL, TURSO_DB_TOKEN } = process.env;

if (!TURSO_DB_URL || !TURSO_DB_TOKEN) {
  throw new Error(
    "Missing TURSO_DB_URL or TURSO_DB_TOKEN environment variable."
  );
}

const db = createClient({
  url: TURSO_DB_URL,
  authToken: TURSO_DB_TOKEN,
});

module.exports = db;
