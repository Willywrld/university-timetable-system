/**
 * Express application factory.
 * server.js starts it; the Jest/Supertest suite imports this module directly.
 */
const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const { loadCurrentUser } = require('./middleware/auth');

const createApp = () => {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.disable('x-powered-by');

  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(
    session({
      name: 'uidlc.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: config.sessionMaxAgeMs,
        secure: false
      }
    })
  );

  app.use((req, res, next) => {
    req.flash = (type, message) => {
      req.session.flash = { type, message };
    };
    next();
  });

  app.use(loadCurrentUser);

  app.use((req, res, next) => {
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    res.locals.currentPath = req.path;
    next();
  });

  app.get('/', (req, res) => res.redirect(req.session.user ? '/dashboard' : '/login'));

  app.use('/', require('./routes/auth'));
  app.use('/', require('./routes/dashboard'));
  app.use('/', require('./routes/masterData').router);
  app.use('/', require('./routes/users'));
  app.use('/', require('./routes/timetables'));
  app.use('/', require('./routes/conflicts'));

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Not found', message: 'The page you requested does not exist.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).render('error', {
      title: 'Server error',
      message: 'Something went wrong while processing the request.'
    });
  });

  return app;
};

module.exports = createApp();
