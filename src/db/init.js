/**
 * CLI: npm run db:init
 * Creates the database file (if needed) and applies schema.sql.
 */
const config = require('../config');
const { getDb } = require('./index');

getDb();
console.log(`Database initialised at ${config.dbPath}`);
