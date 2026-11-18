/**
 * Central configuration.
 * All runtime settings come from the environment (.env) so that no secret is
 * hard-coded in the source tree.
 */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const rootDir = path.join(__dirname, '..');

const config = {
  rootDir,
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  dbPath:
    process.env.DB_PATH && process.env.DB_PATH.trim() === ':memory:'
      ? ':memory:'
      : process.env.DB_PATH
        ? path.resolve(rootDir, process.env.DB_PATH)
        : path.join(rootDir, 'data', 'timetable.db'),
  sessionSecret: process.env.SESSION_SECRET || 'development-only-insecure-secret',
  sessionMaxAgeMs: 1000 * 60 * 60 * 8,
  seedAccounts: {
    admin: {
      username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
      password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@1234',
      fullName: 'System Administrator',
      email: 'admin@dlc.ui.edu.ng'
    },
    officer: {
      username: process.env.DEFAULT_OFFICER_USERNAME || 'officer',
      password: process.env.DEFAULT_OFFICER_PASSWORD || 'Officer@1234',
      fullName: 'Timetable Officer',
      email: 'timetable.officer@dlc.ui.edu.ng'
    },
    viewer: {
      username: process.env.DEFAULT_VIEWER_USERNAME || 'viewer',
      password: process.env.DEFAULT_VIEWER_PASSWORD || 'Viewer@1234',
      fullName: 'Read Only Viewer',
      email: 'viewer@dlc.ui.edu.ng'
    }
  }
};

module.exports = config;
