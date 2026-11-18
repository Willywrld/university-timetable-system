/**
 * Deterministic rule-based greedy scheduler.
 *
 * 1. Validate the request.
 * 2. Load the selected timetable category and the unscheduled activities.
 * 3. Sort activities "most constrained first" (examinations with many
 *    candidates, long activities, GES courses that many groups share).
 * 4. For each activity try time slots (preferred hours first) and then
 *    venues/platforms in a fixed order.
 * 5. Keep the first combination that violates no hard constraint.
 * 6. Otherwise mark the activity unassigned and record the reason.
 * 7. Run full conflict detection and return assigned/unassigned/conflicts.
 *
 * This is a greedy algorithm - no optimisation meta-heuristic is used.
 */
const { addMinutes, toMinutes, overlaps, isValidDate, isValidTime } = require('./timeUtils');
const { capacityCheck } = require('./validation');
const { runConflictDetection } = require('./conflictService');

function constraintScore(request, typeCode) {
  let score = 0;
  if (typeCode === 'examination') score += 10000 + Number(request.expected_candidates || 0);
  if (Number(request.is_ges)) score += 500;
  score += Number(request.duration_minutes || 60) * 2;
  if (request.expected_candidates) score += Number(request.expected_candidates);
  return score;
}

/** Most constrained first, with the assignment id as a stable tie-breaker. */
function sortRequests(requests, typeCode) {
  return requests.slice().sort((a, b) => {
    const diff = constraintScore(b, typeCode) - constraintScore(a, typeCode);
    return diff !== 0 ? diff : a.id - b.id;
  });
}

function facilitatorLoad(placed, facilitatorId, slot) {
  if (!facilitatorId) return 0;
  return placed.filter(
    (row) =>
      row.facilitator_id === facilitatorId &&
      row.date === slot.date &&
      overlaps(row.start_time, row.end_time, slot.start_time, slot.end_time)
  ).length;
}

/**
 * Order candidate slots. Soft constraints are applied here only: preferred
 * (not too early / not too late) hours first, then the facilitator's lighter
 * slots, then chronological order.
 */
function orderSlots(slots, options) {
  const { avoidEarly, avoidLate, balanceWorkload, placed, facilitatorId } = options;
  return slots
    .map((slot) => ({
      slot,
      preferred:
        (!avoidEarly || toMinutes(slot.start_time) >= 9 * 60) &&
        (!avoidLate || toMinutes(slot.end_time) <= 17 * 60),
      load: balanceWorkload ? facilitatorLoad(placed, facilitatorId, slot) : 0
    }))
    .sort((a, b) => {
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      if (a.load !== b.load) return a.load - b.load;
      if (a.slot.date !== b.slot.date) return a.slot.date.localeCompare(b.slot.date);
      if (a.slot.start_time !== b.slot.start_time) return a.slot.start_time.localeCompare(b.slot.start_time);
      return a.slot.id - b.slot.id;
    })
    .map((entry) => entry.slot);
}

/**
 * Order candidate venues: only venues large enough for the candidates, same
 * centre first, then smaller capacity first (deterministic tie-breaks).
 */
function orderVenues(venues, request) {
  let pool = venues.slice();
  if (request.expected_candidates !== null && request.expected_candidates !== undefined && request.expected_candidates !== '') {
    const fits = pool.filter((venue) => Number(venue.capacity) >= Number(request.expected_candidates));
    if (!fits.length) {
      return {
        venues: [],
        reason: `CAPACITY_EXCEEDED: no venue has capacity for ${request.expected_candidates} candidates`
      };
    }
    pool = fits;
  }
  const centre = String(request.centre || '').trim().toLowerCase();
  if (centre) {
    const sameCentre = pool.filter((venue) => String(venue.centre).trim().toLowerCase() === centre);
    if (sameCentre.length) pool = sameCentre;
  }
  pool.sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name) || a.id - b.id);
  return { venues: pool, reason: null };
}

/**
 * Try one slot/resource combination. Returns { ok, reason } and on success the
 * computed start/end times and the chosen resources.
 */
function attemptPlacement(request, slot, resources, placed, typeCode) {
  const duration = Number(request.duration_minutes || 60);
  const start = slot.start_time;
  if (!isValidDate(slot.date) || !isValidTime(start) || !isValidTime(slot.end_time)) {
    return { ok: false, reason: 'INVALID_TIME: the time slot is not a valid date/time' };
  }
  const end = addMinutes(start, duration);
  if (!end) return { ok: false, reason: 'INVALID_TIME: could not compute an end time' };
  if (toMinutes(end) > toMinutes(slot.end_time)) {
    return { ok: false, reason: `INVALID_TIME: a ${duration} minute activity does not fit in slot ${slot.start_time}-${slot.end_time}` };
  }

  const venue = resources.venue || null;
  const platform = resources.platform || null;

  if (typeCode === 'physical' && !venue) {
    return { ok: false, reason: 'MISSING_RESOURCE: a physical session requires a venue' };
  }
  if (typeCode === 'virtual' && !platform) {
    return { ok: false, reason: 'MISSING_RESOURCE: a virtual session requires a platform' };
  }
  if (typeCode === 'examination') {
    if (!venue || !request.exam_format) {
      return { ok: false, reason: 'MISSING_RESOURCE: an examination requires a venue and an exam format' };
    }
    if (!request.centre || String(request.centre).trim() === '') {
      return { ok: false, reason: 'EXAM_CENTRE_MISSING: an examination requires a centre' };
    }
  }

  const capacity = capacityCheck(request.expected_candidates, venue ? venue.capacity : null);
  if (!capacity.ok) return { ok: false, reason: capacity.reason };

  for (const other of placed) {
    if (other.date !== slot.date) continue;
    if (!overlaps(other.start_time, other.end_time, start, end)) continue;

    if (venue && other.venue_id === venue.id) {
      return { ok: false, reason: `VENUE_DOUBLE_BOOKING: ${venue.name} is already booked at ${start} on ${slot.date}` };
    }
    if (request.facilitator_id && other.facilitator_id === request.facilitator_id) {
      return { ok: false, reason: 'FACILITATOR_DOUBLE_BOOKING: the facilitator already has an activity in this period' };
    }
    if (request.student_group_id && other.student_group_id === request.student_group_id) {
      return { ok: false, reason: 'STUDENT_GROUP_CLASH: the student group already has an activity in this period' };
    }
    if (other.course_id === request.course_id && other.timetable_type_id === request.timetable_type_id) {
      return { ok: false, reason: 'DUPLICATE_ASSIGNMENT: the course is already scheduled for this category at this time' };
    }
  }

  return { ok: true, start, end, venue, platform };
}

function loadRequestRows(db, options, typeCode) {
  const where = ["a.timetable_type_id = ?", "a.status IN ('unscheduled', 'unassigned')"];
  const params = [options.timetableTypeId];
  if (options.programmeId) {
    where.push('c.programme_id = ?');
    params.push(Number(options.programmeId));
  }
  if (options.levelId) {
    where.push('c.level_id = ?');
    params.push(Number(options.levelId));
  }
  if (options.courseId) {
    where.push('a.course_id = ?');
    params.push(Number(options.courseId));
  }
  const sql = `
    SELECT a.*, c.course_code, c.course_title, c.programme_id, c.level_id, c.is_ges,
           g.name AS group_name, g.size AS group_size
    FROM assignments a
    JOIN courses c ON c.id = a.course_id
    LEFT JOIN student_groups g ON g.id = a.student_group_id
    WHERE ${where.join(' AND ')}
    ORDER BY a.id
  `;
  return { rows: db.prepare(sql).all(...params), typeCode };
}

function generateSchedule(db, options) {
  const type = db.prepare('SELECT * FROM timetable_types WHERE id = ?').get(options.timetableTypeId);
  if (!type) {
    throw new Error('Timetable category not found');
  }
  if (!isValidDate(options.dateFrom) || !isValidDate(options.dateTo)) {
    throw new Error('A valid date range is required');
  }
  if (options.dateFrom > options.dateTo) {
    throw new Error('The start date must not be after the end date');
  }

  const slots = db
    .prepare('SELECT * FROM time_slots WHERE date BETWEEN ? AND ? ORDER BY date, start_time, id')
    .all(options.dateFrom, options.dateTo);
  if (!slots.length) {
    throw new Error('No time slots exist in the selected date range. Create time slots first.');
  }

  const venues = db.prepare('SELECT * FROM venues WHERE active = 1 ORDER BY id').all();
  const platforms = db.prepare('SELECT * FROM platforms WHERE active = 1 ORDER BY id').all();
  const { rows: requests } = loadRequestRows(db, options, type.code);
  if (!requests.length) {
    throw new Error('There are no unscheduled activities for this category and filter.');
  }

  const placed = db
    .prepare("SELECT * FROM assignments WHERE status = 'scheduled'")
    .all()
    .map((row) => ({ ...row }));

  const assigned = [];
  const unassigned = [];

  const update = db.prepare(`
    UPDATE assignments
    SET date = ?, start_time = ?, end_time = ?, venue_id = ?, platform_id = ?,
        status = ?, unassigned_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  const run = db.transaction(() => {
    for (const request of sortRequests(requests, type.code)) {
      const reasons = [];
      let result = null;

      if (type.code === 'virtual') {
        let platform = null;
        if (request.platform_id) {
          platform = platforms.find((row) => row.id === request.platform_id) || null;
        } else if (platforms.length) {
          platform = platforms[0];
        }

        for (const slot of orderSlots(slots, {
          avoidEarly: options.avoidEarly !== false,
          avoidLate: options.avoidLate !== false,
          balanceWorkload: options.balanceWorkload !== false,
          placed,
          facilitatorId: request.facilitator_id
        })) {
          const attempt = attemptPlacement(request, slot, { venue: null, platform }, placed, type.code);
          if (attempt.ok) {
            result = { slot, ...attempt };
            break;
          }
          reasons.push(attempt.reason);
        }
      } else {
        const venueOrder = orderVenues(venues, request);
        if (venueOrder.reason) reasons.push(venueOrder.reason);

        for (const slot of orderSlots(slots, {
          avoidEarly: options.avoidEarly !== false,
          avoidLate: options.avoidLate !== false,
          balanceWorkload: options.balanceWorkload !== false,
          placed,
          facilitatorId: request.facilitator_id
        })) {
          for (const venue of venueOrder.venues) {
            const attempt = attemptPlacement(request, slot, { venue, platform: null }, placed, type.code);
            if (attempt.ok) {
              result = { slot, ...attempt };
              break;
            }
            reasons.push(attempt.reason);
          }
          if (result) break;
        }
      }

      if (result) {
        update.run(
          result.slot.date,
          result.start,
          result.end,
          result.venue ? result.venue.id : null,
          result.platform ? result.platform.id : null,
          'scheduled',
          null,
          request.id
        );
        placed.push({
          id: request.id,
          course_id: request.course_id,
          timetable_type_id: request.timetable_type_id,
          facilitator_id: request.facilitator_id,
          venue_id: result.venue ? result.venue.id : null,
          platform_id: result.platform ? result.platform.id : null,
          student_group_id: request.student_group_id,
          date: result.slot.date,
          start_time: result.start,
          end_time: result.end,
          status: 'scheduled'
        });
        assigned.push({
          ...request,
          date: result.slot.date,
          start_time: result.start,
          end_time: result.end,
          venue_name: result.venue ? result.venue.name : null,
          platform_name: result.platform ? result.platform.name : null
        });
      } else {
        const reason = reasons[0] || 'No feasible slot and resource combination was found';
        update.run(null, null, null, null, null, 'unassigned', reason, request.id);
        unassigned.push({ ...request, reason });
      }
    }
  });
  run();

  const detection = runConflictDetection(db);
  const runInfo = db
    .prepare(`
      INSERT INTO generation_runs
        (timetable_type_id, requested_by, date_from, date_to, assigned_count, unassigned_count, conflict_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
    .run(
      type.id,
      options.requestedBy || null,
      options.dateFrom,
      options.dateTo,
      assigned.length,
      unassigned.length,
      detection.count
    );

  return {
    type,
    assigned,
    unassigned,
    conflicts: detection.conflicts,
    conflictCount: detection.count,
    runId: Number(runInfo.lastInsertRowid),
    dateFrom: options.dateFrom,
    dateTo: options.dateTo
  };
}

module.exports = {
  generateSchedule,
  sortRequests,
  constraintScore,
  orderSlots,
  orderVenues,
  attemptPlacement
};
