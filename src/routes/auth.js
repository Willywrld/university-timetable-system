const express = require('express');
const bcrypt = require('bcrypt');
const { getDb } = require('../db');
const { writeAudit } = require('../services/audit');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  return res.render('login', { title: 'Sign in', error: null, username: '' });
});

router.post('/login', (req, res) => {
  const db = getDb();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const passwordOk = user ? bcrypt.compareSync(password, user.password_hash) : false;

  if (!user || !user.active || !passwordOk) {
    return res.status(401).render('login', {
      title: 'Sign in',
      error: 'Invalid username or password.',
      username
    });
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role
  };
  writeAudit(db, user.id, 'LOGIN', 'users', user.id, `User ${user.username} signed in`);
  return res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  const userId = req.session.user ? req.session.user.id : null;
  if (userId) {
    writeAudit(getDb(), userId, 'LOGOUT', 'users', userId, 'User signed out');
  }
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
