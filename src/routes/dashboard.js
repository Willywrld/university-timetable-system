const express = require('express');
const { getDb } = require('../db');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', requireLogin, (req, res) => {
  const db = getDb();
  const count = (sql) => db.prepare(sql).get().n;

  const stats = {
    courses: count('SELECT COUNT(*) AS n FROM courses WHERE active = 1'),
    venues: count('SELECT COUNT(*) AS n FROM venues WHERE active = 1'),
    facilitators: count('SELECT COUNT(*) AS n FROM facilitators WHERE active = 1'),
    assignments: count("SELECT COUNT(*) AS n FROM assignments WHERE status = 'scheduled'"),
    unscheduled: count("SELECT COUNT(*) AS n FROM assignments WHERE status IN ('unscheduled', 'unassigned')"),
    openConflicts: count('SELECT COUNT(*) AS n FROM conflicts WHERE resolved = 0'),
    slots: count('SELECT COUNT(*) AS n FROM time_slots')
  };

  const runs = db.prepare(`
    SELECT gr.*, t.name AS type_name, u.username
    FROM generation_runs gr
    LEFT JOIN timetable_types t ON t.id = gr.timetable_type_id
    LEFT JOIN users u ON u.id = gr.requested_by
    ORDER BY gr.id DESC
    LIMIT 5
  `).all();

  const conflicts = db.prepare(`
    SELECT cf.id, cf.conflict_type, cf.severity, cf.message
    FROM conflicts cf
    WHERE cf.resolved = 0
    ORDER BY cf.id
    LIMIT 5
  `).all();

  res.render('dashboard', { title: 'Dashboard', stats, runs, conflicts });
});

module.exports = router;
