/**
 * Conflict detection service.
 *
 * The detection functions are pure (they receive plain assignment objects) so
 * they can be unit tested without a database. runConflictDetection() loads the
 * data, replaces the open conflict rows and returns the fresh list.
 */
const { endAfterStart, isValidDate, isValidTime, overlaps } = require('./timeUtils');
const { capacityCheck } = require('./validation');

const SEVERITY = {
  VENUE_DOUBLE_BOOKING: 'hard',
  FACILITATOR_DOUBLE_BOOKING: 'hard',
  STUDENT_GROUP_CLASH: 'hard',
  CAPACITY_EXCEEDED: 'hard',
  INVALID_TIME: 'hard',
  MISSING_RESOURCE: 'hard',
  EXAM_CENTRE_MISSING: 'hard',
  DUPLICATE_ASSIGNMENT: 'warning'
};

function label(row) {
  const code = row.course_code || `#${row.id}`;
  return `${code} (assignment #${row.id})`;
}

function timeRange(row) {
  return `${row.start_time}-${row.end_time}`;
}

/**
 * Detect duplicate assignments: same course, same timetable type, same date and
 * same start time. This usually means an activity was entered twice.
 * @returns {Array<{assignmentIds:number[], conflictType:string, severity:string, message:string, suggestedFix:string}>}
 */
function findDuplicateAssignments(assignments) {
  const groups = new Map();
  for (const row of assignments) {
    if (row.status !== 'scheduled' || !row.date || !row.start_time) continue;
    const key = [row.course_id, row.timetable_type_id, row.date, row.start_time].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const results = [];
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    for (let i = 1; i < rows.length; i += 1) {
      results.push({
        assignmentIds: [rows[0].id, rows[i].id],
        conflictType: 'DUPLICATE_ASSIGNMENT',
        severity: SEVERITY.DUPLICATE_ASSIGNMENT,
        message: `${label(rows[0])} and ${label(rows[i])} schedule the same course on ${rows[0].date} at ${rows[0].start_time}.`,
        suggestedFix: 'Remove one of the duplicate rows, or change its date/start time.'
      });
    }
  }
  return results;
}

/**
 * Full conflict detection over a list of assignment rows enriched with
 * course/venue/facilitator/group names (see loadAssignmentRows).
 */
function findConflicts(assignments) {
  const conflicts = [];
  const scheduled = assignments.filter((row) => row.status === 'scheduled');

  // ---- single-assignment checks ------------------------------------------
  for (const row of scheduled) {
    if (!isValidDate(row.date) || !isValidTime(row.start_time) || !isValidTime(row.end_time) || !endAfterStart(row.start_time, row.end_time)) {
      conflicts.push({
        assignmentIds: [row.id],
        conflictType: 'INVALID_TIME',
        severity: SEVERITY.INVALID_TIME,
        message: `${label(row)} has an invalid time window (date ${row.date || 'missing'}, ${row.start_time || '??'}-${row.end_time || '??'}). The end time must be after the start time.`,
        suggestedFix: 'Correct the date and make sure the end time is later than the start time.'
      });
      continue; // overlap checks are meaningless for invalid rows
    }

    if (row.type_code === 'physical' && !row.venue_id) {
      conflicts.push({
        assignmentIds: [row.id],
        conflictType: 'MISSING_RESOURCE',
        severity: SEVERITY.MISSING_RESOURCE,
        message: `${label(row)} is a physical session without a venue.`,
        suggestedFix: 'Assign an active venue to the activity.'
      });
    }

    if (row.type_code === 'virtual' && !row.platform_id) {
      conflicts.push({
        assignmentIds: [row.id],
        conflictType: 'MISSING_RESOURCE',
        severity: SEVERITY.MISSING_RESOURCE,
        message: `${label(row)} is a virtual session without a platform.`,
        suggestedFix: 'Assign a platform such as the UIDLC LMS or Zoom.'
      });
    }

    if (row.type_code === 'examination') {
      if (!row.venue_id || !row.exam_format) {
        conflicts.push({
          assignmentIds: [row.id],
          conflictType: 'MISSING_RESOURCE',
          severity: SEVERITY.MISSING_RESOURCE,
          message: `${label(row)} is an examination without ${!row.venue_id ? 'a venue' : 'an exam format'}.`,
          suggestedFix: 'Examinations require a venue/centre and an exam format (CBT, written or practical).'
        });
      }
      if (!row.centre || String(row.centre).trim() === '') {
        conflicts.push({
          assignmentIds: [row.id],
          conflictType: 'EXAM_CENTRE_MISSING',
          severity: SEVERITY.EXAM_CENTRE_MISSING,
          message: `${label(row)} has no examination centre.`,
          suggestedFix: 'Set the centre (for example Ibadan or Lagos).'
        });
      }
    }

    const capacity = capacityCheck(row.expected_candidates, row.venue_capacity);
    if (!capacity.ok) {
      conflicts.push({
        assignmentIds: [row.id],
        conflictType: 'CAPACITY_EXCEEDED',
        severity: SEVERITY.CAPACITY_EXCEEDED,
        message: `${label(row)} expects ${row.expected_candidates} candidates but ${row.venue_name || 'the venue'} holds ${row.venue_capacity}.`,
        suggestedFix: 'Move the activity to a larger venue or split it into more sessions.'
      });
    }
  }

  // ---- pair checks -------------------------------------------------------
  for (let i = 0; i < scheduled.length; i += 1) {
    const a = scheduled[i];
    if (!isValidDate(a.date) || !isValidTime(a.start_time) || !isValidTime(a.end_time)) continue;
    for (let j = i + 1; j < scheduled.length; j += 1) {
      const b = scheduled[j];
      if (!isValidDate(b.date) || !isValidTime(b.start_time) || !isValidTime(b.end_time)) continue;
      if (a.date !== b.date) continue;
      if (!overlaps(a.start_time, a.end_time, b.start_time, b.end_time)) continue;

      const range = `${a.date} between ${a.start_time} and ${a.end_time}`;

      if (a.venue_id && b.venue_id && a.venue_id === b.venue_id) {
        conflicts.push({
          assignmentIds: [a.id, b.id],
          conflictType: 'VENUE_DOUBLE_BOOKING',
          severity: SEVERITY.VENUE_DOUBLE_BOOKING,
          message: `${label(a)} and ${label(b)} both use ${a.venue_name || 'the same venue'} on ${range}.`,
          suggestedFix: 'Move one activity to another venue or to a different time slot.'
        });
      }

      if (a.facilitator_id && b.facilitator_id && a.facilitator_id === b.facilitator_id) {
        conflicts.push({
          assignmentIds: [a.id, b.id],
          conflictType: 'FACILITATOR_DOUBLE_BOOKING',
          severity: SEVERITY.FACILITATOR_DOUBLE_BOOKING,
          message: `${a.facilitator_name || 'The same facilitator'} is assigned to ${label(a)} and ${label(b)} on ${range}.`,
          suggestedFix: 'Reassign one activity to another facilitator or move it to a free slot.'
        });
      }

      if (a.student_group_id && b.student_group_id && a.student_group_id === b.student_group_id) {
        conflicts.push({
          assignmentIds: [a.id, b.id],
          conflictType: 'STUDENT_GROUP_CLASH',
          severity: SEVERITY.STUDENT_GROUP_CLASH,
          message: `${a.group_name || 'The same student group'} is expected at ${label(a)} and ${label(b)} on ${range}.`,
          suggestedFix: 'Move one activity so the student group has no overlapping sessions.'
        });
      }
    }
  }

  conflicts.push(...findDuplicateAssignments(scheduled));

  // Keep the output deterministic.
  conflicts.sort((x, y) => {
    if (x.assignmentIds[0] !== y.assignmentIds[0]) return x.assignmentIds[0] - y.assignmentIds[0];
    if (x.conflictType !== y.conflictType) return x.conflictType.localeCompare(y.conflictType);
    return (x.assignmentIds[1] || 0) - (y.assignmentIds[1] || 0);
  });
  return conflicts;
}

/** SQL used by conflict detection and the timetable views. */
const ASSIGNMENT_WITH_NAMES_SQL = `
  SELECT a.*,
         c.course_code,
         c.course_title,
         c.programme_id,
         c.level_id,
         c.is_ges,
         t.code AS type_code,
         t.name AS type_name,
         v.name AS venue_name,
         v.capacity AS venue_capacity,
         v.centre AS venue_centre,
         f.name AS facilitator_name,
         g.name AS group_name,
         g.size AS group_size,
         p.name AS platform_name
  FROM assignments a
  JOIN courses c ON c.id = a.course_id
  JOIN timetable_types t ON t.id = a.timetable_type_id
  LEFT JOIN venues v ON v.id = a.venue_id
  LEFT JOIN facilitators f ON f.id = a.facilitator_id
  LEFT JOIN student_groups g ON g.id = a.student_group_id
  LEFT JOIN platforms p ON p.id = a.platform_id
`;

function loadAssignmentRows(db) {
  return db.prepare(`${ASSIGNMENT_WITH_NAMES_SQL} ORDER BY a.id`).all();
}

/**
 * Re-run full conflict detection and store the result.
 * Open (unresolved) conflicts are replaced; resolved ones are kept as history.
 */
function runConflictDetection(db) {
  const rows = loadAssignmentRows(db);
  const conflicts = findConflicts(rows);

  const insert = db.prepare(`
    INSERT INTO conflicts
      (assignment_id, related_assignment_ids, conflict_type, severity, message, suggested_fix, detected_at, resolved)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 0)
  `);

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM conflicts WHERE resolved = 0').run();
    for (const conflict of conflicts) {
      insert.run(
        conflict.assignmentIds[0],
        JSON.stringify(conflict.assignmentIds.slice(1)),
        conflict.conflictType,
        conflict.severity,
        conflict.message,
        conflict.suggestedFix || null
      );
    }
  });
  replace();

  return { conflicts, count: conflicts.length };
}

/** Stored open conflicts, ready for the view/JSON API. */
function listOpenConflicts(db) {
  const rows = db.prepare(`
    SELECT cf.id,
           cf.assignment_id,
           cf.related_assignment_ids,
           cf.conflict_type,
           cf.severity,
           cf.message,
           cf.suggested_fix,
           cf.detected_at,
           c.course_code,
           t.code AS type_code,
           a.date,
           a.start_time,
           a.end_time
    FROM conflicts cf
    JOIN assignments a ON a.id = cf.assignment_id
    JOIN courses c ON c.id = a.course_id
    JOIN timetable_types t ON t.id = a.timetable_type_id
    WHERE cf.resolved = 0
    ORDER BY cf.severity, cf.id
  `).all();

  return rows.map((row) => {
    let related = [];
    try {
      related = JSON.parse(row.related_assignment_ids || '[]');
    } catch (error) {
      related = [];
    }
    return {
      ...row,
      assignmentIds: [row.assignment_id, ...related]
    };
  });
}

module.exports = {
  SEVERITY,
  findConflicts,
  findDuplicateAssignments,
  runConflictDetection,
  listOpenConflicts,
  loadAssignmentRows,
  ASSIGNMENT_WITH_NAMES_SQL
};
