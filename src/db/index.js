/**
 * SQLite connection helper (better-sqlite3).
 * The connection is created lazily so that tests can point DB_PATH at an
 * in-memory database before the first query runs.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

let db = null;

function openDatabase(filename) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  if (filename !== ':memory:') {
    database.pragma('journal_mode = WAL');
  }
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  database.exec(schema);
  return database;
}

function getDb() {
  if (!db) {
    db = openDatabase(config.dbPath);
  }
  return db;
}

function setDb(database) {
  db = database;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, setDb, closeDb, openDatabase };
