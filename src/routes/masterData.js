/**
 * Master data management (admin only).
 * A small config object per entity drives the list/add/edit/delete screens so
 * that every table follows the same, explainable pattern.
 */
const express = require('express');
const { getDb } = require('../db');
const { requireRole } = require('../middleware/auth');
const { writeAudit } = require('../services/audit');
const { isValidDate, isValidTime, endAfterStart } = require('../services/timeUtils');

const router = express.Router();
const adminOnly = requireRole('admin');

const ENTITIES = {
  programmes: {
    table: 'programmes',
    title: 'Programmes',
    singular: 'programme',
    listSql: 'SELECT * FROM programmes ORDER BY code',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Programme' },
      { key: 'active', label: 'Active', type: 'bool' }
    ],
    fields: [
      { name: 'code', label: 'Programme code', type: 'text', required: true, hint: 'e.g. CSC' },
      { name: 'name', label: 'Programme name', type: 'text', required: true },
      { name: 'active', label: 'Active', type: 'checkbox', default: 1 }
    ]
  },
  levels: {
    table: 'levels',
    title: 'Levels',
    singular: 'level',
    listSql: 'SELECT * FROM levels ORDER BY level_number',
    columns: [
      { key: 'level_number', label: 'Level' },
      { key: 'active', label: 'Active', type: 'bool' }
    ],
    fields: [
      { name: 'level_number', label: 'Level number', type: 'number', required: true, hint: 'e.g. 100' },
      { name: 'active', label: 'Active', type: 'checkbox', default: 1 }
    ],
    validate(values) {
      const errors = [];
      if (values.level_number !== null && values.level_number < 100) {
        errors.push('Level number must be 100 or higher.');
      }
      return errors;
    }
  },
  courses: {
    table: 'courses',
    title: 'Courses',
    singular: 'course',
    listSql: `
      SELECT c.*, p.name AS programme_name, l.level_number
      FROM courses c
      LEFT JOIN programmes p ON p.id = c.programme_id
      LEFT JOIN levels l ON l.id = c.level_id
      ORDER BY c.course_code
    `,
    columns: [
      { key: 'course_code', label: 'Code' },
      { key: 'course_title', label: 'Title' },
      { key: 'programme_name', label: 'Programme' },
      { key: 'level_number', label: 'Level' },
      { key: 'is_ges', label: 'GES', type: 'bool' },
      { key: 'active', label: 'Active', type: 'bool' }
    ],
    fields: [
      { name: 'course_code', label: 'Course code', type: 'text', required: true },
      { name: 'course_title', label: 'Course title', type: 'text', required: true },
      {
        name: 'programme_id',
        label: 'Programme',
        type: 'select',
        required: true,
        optionsSql: 'SELECT id, name AS label FROM programmes WHERE active = 1 ORDER BY name'
      },
      {
        name: 'level_id',
        label: 'Level',
        type: 'select',
        required: true,
        optionsSql: 'SELECT id, level_number AS label FROM levels WHERE active = 1 ORDER BY level_number'
      },
      { name: 'is_ges', label: 'General (GES) course', type: 'checkbox' },
      { name: 'active', label: 'Active', type: 'checkbox', default: 1 }
    ]
  },
  groups: {
    table: 'student_groups',
    title: 'Student Groups',
    singular: 'student group',
    listSql: `
      SELECT g.*, p.name AS programme_name, l.level_number
      FROM student_groups g
      LEFT JOIN programmes p ON p.id = g.programme_id
      LEFT JOIN levels l ON l.id = g.level_id
      ORDER BY g.name
    `,
    columns: [
      { key: 'name', label: 'Group' },
      { key: 'programme_name', label: 'Programme' },
      { key: 'level_number', label: 'Level' },
      { key: 'size', label: 'Size' }
    ],
    fields: [
      { name: 'name', label: 'Group name', type: 'text', required: true, hint: 'e.g. CSC-100-A' },
      {
        name: 'programme_id',
        label: 'Programme',
        type: 'select',
        optionsSql: 'SELECT id, name AS label FROM programmes ORDER BY name'
      },
      {
        name: 'level_id',
        label: 'Level',
        type: 'select',
        optionsSql: 'SELECT id, level_number AS label FROM levels ORDER BY level_number'
      },
      { name: 'size', label: 'Number of students', type: 'number' }
    ]
  },
  facilitators: {
    table: 'facilitators',
    title: 'Facilitators',
    singular: 'facilitator',
    listSql: 'SELECT * FROM facilitators ORDER BY name',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'active', label: 'Active', type: 'bool' }
    ],
    fields: [
      { name: 'name', label: 'Full name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'text' },
      { name: 'active', label: 'Active', type: 'checkbox', default: 1 }
    ]
  },
  venues: {
    table: 'venues',
    title: 'Venues',
    singular: 'venue',
    listSql: 'SELECT * FROM venues ORDER BY centre, name',
    columns: [
      { key: 'name', label: 'Venue' },
      { key: 'centre', label: 'Centre' },
      { key: 'capacity', label: 'Capacity' },
      { key: 'active', label: 'Active', type: 'bool' }
    ],
    fields: [
      { name: 'name', label: 'Venue name', type: 'text', required: true },
      { name: 'centre', label: 'Centre', type: 'text', required: true, hint: 'e.g. Ibadan' },
      { name: 'capacity', label: 'Capacity', type: 'number', required: true },
      { name: 'active', label: 'Active', type: 'checkbox', default: 1 }
    ],
    validate(values) {
      const errors = [];
      if (values.capacity !== null && values.capacity <= 0) errors.push('Capacity must be greater than zero.');
      return errors;
    }
  },
  platforms: {
    table: 'platforms',
    title: 'Platforms',
    singular: 'platform',
    listSql: 'SELECT * FROM platforms ORDER BY name',
    columns: [
      { key: 'name', label: 'Platform' },
      { key: 'active', label: 'Active', type: 'bool' }
    ],
    fields: [
      { name: 'name', label: 'Platform name', type: 'text', required: true, hint: 'e.g. UIDLC LMS' },
      { name: 'active', label: 'Active', type: 'checkbox', default: 1 }
    ]
  },
  slots: {
    table: 'time_slots',
    title: 'Time Slots',
    singular: 'time slot',
    listSql: 'SELECT * FROM time_slots ORDER BY date, start_time',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'start_time', label: 'Start' },
      { key: 'end_time', label: 'End' }
    ],
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'start_time', label: 'Start time', type: 'time', required: true },
      { name: 'end_time', label: 'End time', type: 'time', required: true }
    ],
    validate(values) {
      const errors = [];
      if (!isValidDate(values.date)) errors.push('A valid date is required.');
      if (!isValidTime(values.start_time)) errors.push('A valid start time is required.');
      if (!isValidTime(values.end_time)) errors.push('A valid end time is required.');
      if (isValidTime(values.start_time) && isValidTime(values.end_time) && !endAfterStart(values.start_time, values.end_time)) {
        errors.push('End time must be after start time.');
      }
      return errors;
    }
  }
};

const ENTITY_ROUTES = {
  programmes: 'programmes',
  levels: 'levels',
  courses: 'courses',
  groups: 'groups',
  facilitators: 'facilitators',
  venues: 'venues',
  platforms: 'platforms',
  slots: 'slots'
};

function fieldOptions(cfg) {
  const db = getDb();
  const options = {};
  for (const field of cfg.fields) {
    if (field.type === 'select' && field.optionsSql) {
      options[field.name] = db.prepare(field.optionsSql).all();
    }
  }
  return options;
}

function emptyValues(cfg) {
  const values = {};
  for (const field of cfg.fields) {
    values[field.name] = field.type === 'checkbox' ? field.default || 0 : '';
  }
  return values;
}

function collectValues(cfg, body) {
  const errors = [];
  const values = {};

  for (const field of cfg.fields) {
    if (field.type === 'checkbox') {
      values[field.name] = body[field.name] ? 1 : 0;
      continue;
    }
    const raw = body[field.name] === undefined || body[field.name] === null ? '' : String(body[field.name]).trim();
    if (field.required && raw === '') {
      errors.push(`${field.label} is required.`);
      values[field.name] = null;
      continue;
    }
    if (raw === '') {
      values[field.name] = null;
    } else if (field.type === 'number') {
      if (!/^-?\d+$/.test(raw)) {
        errors.push(`${field.label} must be a whole number.`);
        values[field.name] = null;
      } else {
        values[field.name] = Number(raw);
      }
    } else if (field.type === 'select') {
      values[field.name] = Number(raw);
    } else {
      values[field.name] = raw;
    }
  }

  if (typeof cfg.validate === 'function' && errors.length === 0) {
    errors.push(...cfg.validate(values));
  }
  return { values, errors };
}

function renderList(req, res, cfg, options = {}) {
  const db = getDb();
  const editId = options.editId || (req.query.edit ? Number(req.query.edit) : null);
  const rows = db.prepare(cfg.listSql).all();
  const editRow = editId ? db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(editId) : null;

  return res.status(options.status || 200).render('master/list', {
    title: cfg.title,
    entityKey: req.params.entity,
    cfg,
    rows,
    editRow: editRow || null,
    values: options.values || (editRow ? { ...editRow } : emptyValues(cfg)),
    fieldOptions: fieldOptions(cfg),
    error: options.error || null,
    basePath: `/admin/${req.params.entity}`,
    formAction: editRow
      ? `/admin/${req.params.entity}/${editRow.id}/update`
      : `/admin/${req.params.entity}`
  });
}

// GET /admin/:entity
router.get('/admin/:entity', adminOnly, (req, res, next) => {
  const cfg = ENTITIES[req.params.entity];
  if (!cfg) return next();
  return renderList(req, res, cfg);
});

// POST /admin/:entity  (create)
router.post('/admin/:entity', adminOnly, (req, res, next) => {
  const cfg = ENTITIES[req.params.entity];
  if (!cfg) return next();
  const db = getDb();
  const { values, errors } = collectValues(cfg, req.body);

  if (errors.length) {
    return renderList(req, res, cfg, { error: errors.join(' '), values, status: 400 });
  }

  const columns = Object.keys(values);
  const placeholders = columns.map((column) => `@${column}`).join(', ');
  try {
    const info = db
      .prepare(`INSERT INTO ${cfg.table} (${columns.join(', ')}) VALUES (${placeholders})`)
      .run(values);
    writeAudit(db, req.session.user.id, 'CREATE', cfg.table, Number(info.lastInsertRowid), JSON.stringify(values));
    req.session.flash = { type: 'success', message: `${cfg.singular} created.` };
    return res.redirect(`/admin/${req.params.entity}`);
  } catch (error) {
    return renderList(req, res, cfg, {
      error: `Could not save: ${error.message}`,
      values,
      status: 400
    });
  }
});

// POST /admin/:entity/:id/update
router.post('/admin/:entity/:id/update', adminOnly, (req, res, next) => {
  const cfg = ENTITIES[req.params.entity];
  if (!cfg) return next();
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM ${cfg.table} WHERE id = ?`).get(id);
  if (!existing) return res.status(404).render('error', { title: 'Not found', message: 'Record not found.' });

  const { values, errors } = collectValues(cfg, req.body);
  if (errors.length) {
    return renderList(req, res, cfg, { error: errors.join(' '), values, editId: id, status: 400 });
  }

  const assignments = Object.keys(values).map((column) => `${column} = @${column}`).join(', ');
  try {
    db.prepare(`UPDATE ${cfg.table} SET ${assignments} WHERE id = @id`).run({ ...values, id });
    writeAudit(db, req.session.user.id, 'UPDATE', cfg.table, id, JSON.stringify(values));
    req.session.flash = { type: 'success', message: `${cfg.singular} updated.` };
    return res.redirect(`/admin/${req.params.entity}`);
  } catch (error) {
    return renderList(req, res, cfg, {
      error: `Could not update: ${error.message}`,
      values,
      editId: id,
      status: 400
    });
  }
});

// POST /admin/:entity/:id/delete
router.post('/admin/:entity/:id/delete', adminOnly, (req, res, next) => {
  const cfg = ENTITIES[req.params.entity];
  if (!cfg) return next();
  const db = getDb();
  const id = Number(req.params.id);
  try {
    db.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).run(id);
    writeAudit(db, req.session.user.id, 'DELETE', cfg.table, id, null);
    req.session.flash = { type: 'success', message: `${cfg.singular} deleted.` };
  } catch (error) {
    req.session.flash = {
      type: 'danger',
      message: `Cannot delete this ${cfg.singular} because other records depend on it.`
    };
  }
  return res.redirect(`/admin/${req.params.entity}`);
});

module.exports = { router, ENTITIES, ENTITY_ROUTES };
