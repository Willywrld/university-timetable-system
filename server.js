require('dotenv').config();

const config = require('./src/config');
const app = require('./src/app');
const { getDb } = require('./src/db');

const db = getDb();
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

if (!userCount) {
  console.warn('No users found. Run "npm run db:seed" to create the demo accounts.');
}

if (config.nodeEnv === 'production' && config.sessionSecret === 'development-only-insecure-secret') {
  console.warn('WARNING: SESSION_SECRET is still the development default. Set it in .env.');
}

app.listen(config.port, () => {
  console.log(`University Timetable System running on http://localhost:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
});
