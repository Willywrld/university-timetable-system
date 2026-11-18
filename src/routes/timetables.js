const express = require('express');
const { getDb } = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { generateSchedule } = require('../services/scheduler');
const { runConflictDetection, listOpenConflicts } = require('../services/conflictService');
const {
  loadAssignments,
  getAssignment,
  validateAssignmentInput,
  createAssignment,
  updateAssignment
} = require('../services/assignments');
const { toCsv, TIMETABLE_COLUMNS } = require('../services/csv');
const { writeAudit } = require('../services/audit');

const router = express.Router();
const officerOnly = requireRole('admin', 'timetable_officer');

function referenceData(db) {
  return {
    types: db.prepare('SELECT * FROM timetable_types ORDER BY id').all(),
    programmes: db.prepare('SELECT * FROM programmes ORDER BY name').all(),
    levels: db.prepare('SELECT * FROM levels ORDER BY level_number').all(),
    courses: db.prepare('SELECT id, course_code, course_title FROM courses ORDER BY course_code').all(),
    facilitators: db.prepare('SELECT * FROM facilitators WHERE active = 1 ORDER BY name').all(),
    venues: db.prepare('SELECT * FROM venues WHERE active = 1 ORDER BY centre, name').all(),
    platforms: db.prepare('SELECT * FROM platforms WHERE active = 1 ORDER BY name').all(),
    groups: db.prepare('SELECT * FROM student_groups ORDER BY name').all()
  };
}

function readFilters(query) {
  return {
    category: query.category || '',
    course_id: query.course_id || '',
    programme_id: query.programme_id || '',
    level_id: query.level_id || '',
    venue_id: query.venue_id || '',
    platform_id: query.platform_id || '',
    date_from: query.date_from || '',
    date_to: query.date_to || '',
    q: query.q || ''
  };
}

// ---------------------------------------------------------------------------
// Timetable view / search / filter
// ---------------------------------------------------------------------------
router.get('/timetables', requireLogin, (req, res) => {
  const db = getDb();
  const filters = readFilters(req.query);
  const rows = loadAssignments(db, filters);
  res.render('timetables/index', {
    title: 'Timetable',
    rows,
    filters,
    reference: referenceData(db)
  });
});

router.get('/timetables/export.csv', requireLogin, (req, res) => {
  const db = getDb();
  const filters = readFilters(req.query);
  const rows = loadAssignments(db, filters);
  const csv = toCsv(rows, TIMETABLE_COLUMNS);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="timetable-${stamp}.csv"`);
  res.send(csv);
});

// ---------------------------------------------------------------------------
// Setup overview
// ---------------------------------------------------------------------------
router.get('/timetables/setup', officerOnly, (req, res) => {
  const db = getDb();
  const counts = {
    slots: db.prepare('SELECT COUNT(*) AS n FROM time_slots').get().n,
    venues: db.prepare('SELECT COUNT(*) AS n FROM venues WHERE active = 1').get().n,
    platforms: db.prepare('SELECT COUNT(*) AS n FROM platforms WHERE active = 1').get().n,
    requests: db.prepare("SELECT COUNT(*) AS n FROM assignments WHERE status IN ('unscheduled','unassigned')").get().n
  };
  const perType = db.prepare(`
    SELECT t.id, t.code, t.name, t.description,
           SUM(CASE WHEN a.status = 'unscheduled' THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN a.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
           SUM(CASE WHEN a.status = 'unassigned' THEN 1 ELSE 0 END) AS unassigned
    FROM timetable_types t
    LEFT JOIN assignments a ON a.timetable_type_id = t.id
    GROUP BY t.id
    ORDER BY t.id
  `).all();
  res.render('timetables/setup', { title: 'Timetable Setup', counts, perType });
});

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
router.get('/timetables/generate', officerOnly, (req, res) => {
  const db = getDb();
  const bounds = db.prepare('SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM time_slots').get();
  res.render('timetables/generate', {
    title: 'Generate Timetable',
    reference: referenceData(db),
    bounds,
    error: null,
    form: {
      timetable_type_id: req.query.category
        ? (db.prepare('SELECT id FROM timetable_types WHERE code = ?').get(req.query.category) || {}).id || ''
        : '',
      date_from: bounds.min_date || '',
      date_to: bounds.max_date || '',
      programme_id: '',
      level_id: '',
      course_id: '',
      avoidEarly: true,
      avoidLate: true,
      balanceWorkload: true
    }
  });
});

router.post('/timetables/generate', officerOnly, (req, res) => {
  const db = getDb();
  const form = {
    timetable_type_id: req.body.timetable_type_id || '',
    date_from: req.body.date_from || '',
    date_to: req.body.date_to || '',
    programme_id: req.body.programme_id || '',
    level_id: req.body.level_id || '',
    course_id: req.body.course_id || '',
    avoidEarly: Boolean(req.body.avoidEarly),
    avoidLate: Boolean(req.body.avoidLate),
    balanceWorkload: Boolean(req.body.balanceWorkload)
  };

  try {
    const result = generateSchedule(db, {
      timetableTypeId: Number(form.timetable_type_id),
      dateFrom: form.date_from,
      dateTo: form.date_to,
      programmeId: form.programme_id ? Number(form.programme_id) : null,
      levelId: form.level_id ? Number(form.level_id) : null,
      courseId: form.course_id ? Number(form.course_id) : null,
      avoidEarly: form.avoidEarly,
      avoidLate: form.avoidLate,
      balanceWorkload: form.balanceWorkload,
      requestedBy: req.session.user.id
    });

    writeAudit(
      db,
      req.session.user.id,
      'GENERATE',
      'assignments',
      result.runId,
      `${result.type.code}: ${result.assigned.length} assigned, ${result.unassigned.length} unassigned`
    );

    return res.render('timetables/result', {
      title: 'Generation Result',
      result,
      dateFrom: form.date_from,
      dateTo: form.date_to
    });
  } catch (error) {
    const bounds = db.prepare('SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM time_slots').get();
    return res.status(400).render('timetables/generate', {
      title: 'Generate Timetable',
      reference: referenceData(db),
      bounds,
      error: error.message,
      form
    });
  }
});

// ---------------------------------------------------------------------------
// Manual creation and adjustment of activities
// ---------------------------------------------------------------------------
function assignmentFormValues(assignment) {
  if (!assignment) {
    return {
      timetable_type_id: '',
      course_id: '',
      facilitator_id: '',
      venue_id: '',
      platform_id: '',
      student_group_id: '',
      date: '',
      start_time: '',
      end_time: '',
      expected_candidates: '',
      exam_format: '',
      centre: '',
      status: 'scheduled'
    };
  }
  const values = { ...assignment };
  for (const key of Object.keys(values)) {
    if (values[key] === null || values[key] === undefined) values[key] = '';
  }
  return values;
}

function conflictsForAssignment(db, id) {
  return listOpenConflicts(db).filter((conflict) => conflict.assignmentIds.includes(Number(id)));
}

router.get('/timetables/new', officerOnly, (req, res) => {
  const db = getDb();
  res.render('timetables/form', {
    title: 'New Activity',
    formAction: '/timetables',
    assignment: null,
    values: assignmentFormValues(null),
    reference: referenceData(db),
    errors: [],
    conflicts: []
  });
});

router.post('/timetables', officerOnly, (req, res) => {
  const db = getDb();
  const { errors, values } = validateAssignmentInput(db, req.body);
  if (errors.length) {
    return res.status(400).render('timetables/form', {
      title: 'New Activity',
      formAction: '/timetables',
      assignment: null,
      values: assignmentFormValues({ ...req.body }),
      reference: referenceData(db),
      errors,
      conflicts: []
    });
  }

  const id = createAssignment(db, values, req.session.user.id);
  writeAudit(db, req.session.user.id, 'CREATE', 'assignments', id, `Created assignment #${id}`);
  const detection = runConflictDetection(db);
  req.session.flash = {
    type: detection.count ? 'warning' : 'success',
    message: `Activity saved. Conflict detection found ${detection.count} open conflict(s).`
  };
  return res.redirect(`/timetables/${id}/edit`);
});

router.get('/timetables/:id/edit', officerOnly, (req, res) => {
  const db = getDb();
  const assignment = getAssignment(db, req.params.id);
  if (!assignment) return res.status(404).render('error', { title: 'Not found', message: 'Activity not found.' });

  res.render('timetables/form', {
    title: `Edit Activity #${assignment.id}`,
    formAction: `/timetables/${assignment.id}/edit`,
    assignment,
    values: assignmentFormValues(assignment),
    reference: referenceData(db),
    errors: [],
    conflicts: conflictsForAssignment(db, assignment.id)
  });
});

router.post('/timetables/:id/edit', officerOnly, (req, res) => {
  const db = getDb();
  const assignment = getAssignment(db, req.params.id);
  if (!assignment) return res.status(404).render('error', { title: 'Not found', message: 'Activity not found.' });

  const { errors, values } = validateAssignmentInput(db, req.body);
  if (errors.length) {
    return res.status(400).render('timetables/form', {
      title: `Edit Activity #${assignment.id}`,
      formAction: `/timetables/${assignment.id}/edit`,
      assignment,
      values: { ...assignmentFormValues(assignment), ...req.body },
      reference: referenceData(db),
      errors,
      conflicts: conflictsForAssignment(db, assignment.id)
    });
  }

  updateAssignment(db, assignment.id, values);
  writeAudit(
    db,
    req.session.user.id,
    'UPDATE',
    'assignments',
    assignment.id,
    `Manual adjustment: ${values.date || 'unscheduled'} ${values.start_time || ''}-${values.end_time || ''}`
  );
  const detection = runConflictDetection(db);
  const mine = conflictsForAssignment(db, assignment.id);
  req.session.flash = {
    type: mine.length ? 'warning' : 'success',
    message: mine.length
      ? `Saved. This activity still has ${mine.length} conflict(s).`
      : `Saved. Full re-check found ${detection.count} open conflict(s) elsewhere.`
  };
  return res.redirect(`/timetables/${assignment.id}/edit`);
});

// ---------------------------------------------------------------------------
// JSON API (used by the automated tests and available for integrations)
// ---------------------------------------------------------------------------
router.get('/api/timetables', requireLogin, (req, res) => {
  const rows = loadAssignments(getDb(), readFilters(req.query));
  res.json(rows);
});

router.get('/api/conflicts', requireLogin, (req, res) => {
  res.json(listOpenConflicts(getDb()));
});

module.exports = router;
