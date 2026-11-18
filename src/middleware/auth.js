/** Route protection helpers. */
const { getDb } = require('../db');

function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        title: 'Access denied',
        message: 'Your role does not allow access to this page.'
      });
    }
    return next();
  };
}

/** Load the current user row on each request (so role changes take effect). */
function loadCurrentUser(req, res, next) {
  res.locals.currentUser = null;
  if (req.session && req.session.user) {
    const user = getDb()
      .prepare('SELECT id, username, full_name, role, active FROM users WHERE id = ?')
      .get(req.session.user.id);
    if (user && user.active) {
      res.locals.currentUser = user;
      req.session.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
    } else {
      req.session.destroy(() => {});
    }
  }
  next();
}

module.exports = { requireLogin, requireRole, loadCurrentUser };
