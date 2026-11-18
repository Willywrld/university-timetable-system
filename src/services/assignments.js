/**
 * Assignment (timetable activity) data access, validation and saving.
 * Every statement is parameterised.
 */
const { isValidDate, isValidTime, minutesBetween, endAfterStart } = require('./timeUtils');
const { EXAM_FORMATS, ASSIGNMENT_STATUSES } = require('./validation');
const { ASSIGNMENT_WITH_NAMES_SQL } = require('./conflictService');

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function loadAssignments(db, filters = {}) {
  const where = ["a.status = 'scheduled'"];
  const params = [];

  if (filters.category) {
    where.push('t.code = ?');
    params.push(filters.category);
  }
  if (filters.course_id) {
    where.push('a.course_id = ?');
    params.push(Number(filters.course_id));
  }
  if (filters.programme_id) {
    where.push('c.programme_id = ?');
    params.push(Number(filters.programme_id));
  }
  if (filters.level_id) {
    where.push('c.level_id = ?');
    params.push(Number(filters.level_id));
  }
  if (filters.venue_id) {
    where.push('a.venue_id = ?');
    params.push(Number(filters.venue_id));
  }
  if (filters.platform_id) {
    where.push('a.platform_id = ?');
    params.push(Number(filters.platform_id));
  }
  if (filters.date_from) {
    where.push('a.date >= ?');
    params.push(filters.date_from);
  }
  if (filters.date_to) {
    where.push('a.date <= ?');
    params.push(filters.date_to);
  }
  if (filters.q) {
    const like = `%${filters.q}%`;
    where.push('(c.course_code LIKE ? OR c.course_title LIKE ? OR v.name LIKE ? OR f.name LIKE ?)');
    params.push(like, like, like, like);
  }

  const sql = `
    ${ASSIGNMENT_WITH_NAMES_SQL}
    WHERE ${where.join(' AND ')}
    ORDER BY a.date, a.start_time, c.course_code, a.id
  `;
  return db.prepare(sql).all(...params);
}

function getAssignment(db, id) {
  return db.prepare(`${ASSIGNMENT_WITH_NAMES_SQL} WHERE a.id = ?`).get(Number(id));
}

/**
 * Server-side validation and normalisation of the assignment form.
 * Structural problems (missing fields, bad times) block the save. Business
 * rule problems (capacity, missing venue for a category, ...) are allowed and
 * reported by the conflict detector instead.
 */
function validateAssignmentInput(db, body) {
  const errors = [];
  const values = {
    timetable_type_id: numberOrNull(body.timetable_type_id),
    course_id: numberOrNull(body.course_id),
    facilitator_id: numberOrNull(body.facilitator_id),
    venue_id: numberOrNull(body.venue_id),
    platform_id: numberOrNull(body.platform_id),
    student_group_id: numberOrNull(body.student_group_id),
    date: textOrNull(body.date),
    start_time: textOrNull(body.start_time),
    end_time: textOrNull(body.end_time),
    expected_candidates: numberOrNull(body.expected_candidates),
    exam_format: textOrNull(body.exam_format),
    centre: textOrNull(body.centre),
    status: textOrNull(body.status) || 'scheduled'
  };

  const type = values.timetable_type_id
    ? db.prepare('SELECT * FROM timetable_types WHERE id = ?').get(values.timetable_type_id)
    : null;
  if (!type) errors.push('Timetable category is required.');

  const course = values.course_id
    ? db.prepare('SELECT * FROM courses WHERE id = ?').get(values.course_id)
    : null;
  if (!course) errors.push('Course is required.');

  if (!ASSIGNMENT_STATUSES.includes(values.status)) {
    errors.push('Invalid assignment status.');
  }

  if (values.status === 'scheduled') {
    if (!isValidDate(values.date)) errors.push('A valid date (YYYY-MM-DD) is required.');
    if (!isValidTime(values.start_time)) errors.push('A valid start time (HH:MM) is required.');
    if (!isValidTime(values.end_time)) errors.push('A valid end time (HH:MM) is required.');
    if (isValidTime(values.start_time) && isValidTime(values.end_time) && !endAfterStart(values.start_time, values.end_time)) {
      errors.push('End time must be after start time.');
    }
  } else {
    values.date = null;
    values.start_time = null;
    values.end_time = null;
  }

  if (values.expected_candidates !== null && values.expected_candidates < 0) {
    errors.push('Expected candidates cannot be negative.');
  }

  if (values.exam_format && !EXAM_FORMATS.includes(values.exam_format)) {
    errors.push('Exam format must be CBT, written or practical.');
  }

  values.duration_minutes =
    values.start_time && values.end_time && endAfterStart(values.start_time, values.end_time)
      ? minutesBetween(values.start_time, values.end_time)
      : Number(body.duration_minutes) > 0
        ? Number(body.duration_minutes)
        : 120;

  return { errors, values, type };
}

function createAssignment(db, values, userId) {
  const info = db
    .prepare(`
      INSERT INTO assignments
        (timetable_type_id, course_id, facilitator_id, venue_id, platform_id, student_group_id,
         date, start_time, end_time, expected_candidates, exam_format, centre, duration_minutes,
         status, created_by, created_at)
      VALUES (@timetable_type_id, @course_id, @facilitator_id, @venue_id, @platform_id, @student_group_id,
              @date, @start_time, @end_time, @expected_candidates, @exam_format, @centre, @duration_minutes,
              @status, @created_by, datetime('now'))
    `)
    .run({ ...values, created_by: userId || null });
  return Number(info.lastInsertRowid);
}

function updateAssignment(db, id, values) {
  db.prepare(`
    UPDATE assignments
    SET timetable_type_id = @timetable_type_id,
        course_id = @course_id,
        facilitator_id = @facilitator_id,
        venue_id = @venue_id,
        platform_id = @platform_id,
        student_group_id = @student_group_id,
        date = @date,
        start_time = @start_time,
        end_time = @end_time,
        expected_candidates = @expected_candidates,
        exam_format = @exam_format,
        centre = @centre,
        duration_minutes = @duration_minutes,
        status = @status,
        unassigned_reason = NULL,
        updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...values, id: Number(id) });
}

module.exports = {
  loadAssignments,
  getAssignment,
  validateAssignmentInput,
  createAssignment,
  updateAssignment
};
