const express = require('express');
const bcrypt = require('bcrypt');
const { getDb } = require('../db');
const { requireRole } = require('../middleware/auth');
const { writeAudit } = require('../services/audit');

const router = express.Router();
const ROLES = ['admin', 'timetable_officer', 'viewer'];

router.get('/users', requireRole('admin'), (req, res) => {
  const users = getDb().prepare(`
    SELECT id, username, full_name, email, role, active, created_at FROM users ORDER BY username
  `).all();
  res.render('users/index', { title: 'User Management', users, roles: ROLES, error: null });
});

router.post('/users', requireRole('admin'), (req, res) => {
  const db = getDb();
  const username = String(req.body.username || '').trim();
  const fullName = String(req.body.full_name || '').trim();
  const email = String(req.body.email || '').trim();
  const role = String(req.body.role || '');
  const password = String(req.body.password || '');

  const errors = [];
  if (!username) errors.push('Username is required.');
  if (!fullName) errors.push('Full name is required.');
  if (!ROLES.includes(role)) errors.push('A valid role is required.');
  if (password.length < 8) errors.push('Password must be at least 8 characters.');

  if (errors.length) {
    const users = db.prepare('SELECT id, username, full_name, email, role, active, created_at FROM users ORDER BY username').all();
    return res.status(400).render('users/index', {
      title: 'User Management',
      users,
      roles: ROLES,
      error: errors.join(' ')
    });
  }

  try {
    const info = db.prepare(`
      INSERT INTO users (username, full_name, email, password_hash, role, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(username, fullName, email, bcrypt.hashSync(password, 10), role);
    writeAudit(db, req.session.user.id, 'CREATE', 'users', Number(info.lastInsertRowid), `Created user ${username} (${role})`);
    req.session.flash = { type: 'success', message: 'User created.' };
  } catch (error) {
    req.session.flash = { type: 'danger', message: `Could not create user: ${error.message}` };
  }
  return res.redirect('/users');
});

router.post('/users/:id/update', requireRole('admin'), (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    req.session.flash = { type: 'danger', message: 'User not found.' };
    return res.redirect('/users');
  }

  const role = String(req.body.role || user.role);
  const active = req.body.active ? 1 : 0;
  if (!ROLES.includes(role)) {
    req.session.flash = { type: 'danger', message: 'Invalid role.' };
    return res.redirect('/users');
  }

  db.prepare('UPDATE users SET role = ?, active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(role, active, id);

  const newPassword = String(req.body.password || '');
  if (newPassword) {
    if (newPassword.length < 8) {
      req.session.flash = { type: 'danger', message: 'Password must be at least 8 characters.' };
      return res.redirect('/users');
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), id);
  }

  writeAudit(db, req.session.user.id, 'UPDATE', 'users', id, `role=${role} active=${active}${newPassword ? ' password reset' : ''}`);
  req.session.flash = { type: 'success', message: 'User updated.' };
  return res.redirect('/users');
});

module.exports = router;
