/**
 * Shared validation rules for individual assignments (also unit tested).
 */
const { endAfterStart, isValidDate, isValidTime } = require('./timeUtils');

const TIMETABLE_TYPE_CODES = ['physical', 'virtual', 'examination'];
const EXAM_FORMATS = ['CBT', 'written', 'practical'];
const ASSIGNMENT_STATUSES = ['unscheduled', 'scheduled', 'unassigned'];

/**
 * Capacity check.
 * Returns { ok: true } when either value is unknown, otherwise compares
 * expected candidates with the venue capacity.
 */
function capacityCheck(expectedCandidates, venueCapacity) {
  if (
    expectedCandidates === null ||
    expectedCandidates === undefined ||
    expectedCandidates === '' ||
    venueCapacity === null ||
    venueCapacity === undefined ||
    venueCapacity === ''
  ) {
    return { ok: true, reason: null };
  }
  const expected = Number(expectedCandidates);
  const capacity = Number(venueCapacity);
  if (!Number.isFinite(expected) || !Number.isFinite(capacity)) {
    return { ok: false, reason: 'CAPACITY_EXCEEDED: capacity could not be compared' };
  }
  if (expected <= capacity) return { ok: true, reason: null };
  return {
    ok: false,
    reason: `CAPACITY_EXCEEDED: ${expected} candidates exceed venue capacity of ${capacity}`
  };
}

/**
 * Structural time validation: both values must be valid times and the end must
 * be after the start. Used before saving a manual edit.
 */
function checkTimeWindow(startTime, endTime) {
  if (!isValidTime(startTime)) return { ok: false, reason: 'INVALID_TIME: start time is not a valid HH:MM value' };
  if (!isValidTime(endTime)) return { ok: false, reason: 'INVALID_TIME: end time is not a valid HH:MM value' };
  if (!endAfterStart(startTime, endTime)) {
    return { ok: false, reason: 'INVALID_TIME: end time must be after start time' };
  }
  return { ok: true, reason: null };
}

/** A date is required for any scheduled activity. */
function checkDate(value) {
  if (!isValidDate(value)) return { ok: false, reason: 'INVALID_TIME: a valid date (YYYY-MM-DD) is required' };
  return { ok: true, reason: null };
}

module.exports = {
  TIMETABLE_TYPE_CODES,
  EXAM_FORMATS,
  ASSIGNMENT_STATUSES,
  capacityCheck,
  checkTimeWindow,
  checkDate
};
