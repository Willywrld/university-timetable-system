const express = require('express');
const { getDb } = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { listOpenConflicts, runConflictDetection } = require('../services/conflictService');
const { writeAudit } = require('../services/audit');

const router = express.Router();
const officerOnly = requireRole('admin', 'timetable_officer');

router.get('/conflicts', requireLogin, (req, res) => {
  const db = getDb();
  const conflicts = listOpenConflicts(db);
  const summary = conflicts.reduce(
    (acc, conflict) => {
      acc.total += 1;
      acc[conflict.severity] = (acc[conflict.severity] || 0) + 1;
      return acc;
    },
    { total: 0, hard: 0, warning: 0 }
  );
  res.render('conflicts/index', {
    title: 'Conflict Report',
    conflicts,
    summary,
    canResolve: req.session.user.role !== 'viewer'
  });
});

router.post('/conflicts/run', officerOnly, (req, res) => {
  const db = getDb();
  const { count } = runConflictDetection(db);
  writeAudit(db, req.session.user.id, 'CHECK_CONFLICTS', 'conflicts', null, `Full conflict check: ${count} open conflict(s)`);
  req.session.flash = { type: count ? 'warning' : 'success', message: `Conflict check complete. ${count} open conflict(s).` };
  res.redirect('/conflicts');
});

router.post('/conflicts/:id/resolve', officerOnly, (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const conflict = db.prepare('SELECT * FROM conflicts WHERE id = ?').get(id);
  if (!conflict) {
    req.session.flash = { type: 'danger', message: 'Conflict not found.' };
    return res.redirect('/conflicts');
  }
  db.prepare(`
    UPDATE conflicts
    SET resolved = 1, resolved_by = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).run(req.session.user.id, id);
  writeAudit(db, req.session.user.id, 'RESOLVE_CONFLICT', 'conflicts', id, conflict.message);
  req.session.flash = { type: 'success', message: 'Conflict marked as resolved.' };
  return res.redirect('/conflicts');
});

module.exports = router;
