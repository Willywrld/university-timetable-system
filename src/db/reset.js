/**
 * CLI: npm run db:reset
 * Deletes the local SQLite file and recreates it with fresh seed data.
 * DEVELOPMENT ONLY - this destroys all local timetable data.
 */
const fs = require('fs');
const config = require('../config');
const { getDb, closeDb } = require('./index');
const { seedDatabase } = require('./seed');

if (config.dbPath === ':memory:') {
  throw new Error('db:reset cannot be used with an in-memory database');
}

closeDb();
for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const file = config.dbPath + suffix;
  if (fs.existsSync(file)) fs.rmSync(file);
}

const db = getDb();
const result = seedDatabase(db);
console.log(result.skipped ? 'Database already seeded.' : 'Database reset and seeded.');
