/**
 * Time and date helpers.
 * Times are stored as zero-padded 'HH:MM' TEXT so that lexicographic and
 * numeric (minutes) comparisons both behave correctly.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value.trim());
}

/** 'HH:MM' -> minutes after midnight, or null when the value is invalid. */
function toMinutes(value) {
  if (!isValidTime(value)) return null;
  const [hours, minutes] = value.trim().split(':').map(Number);
  return hours * 60 + minutes;
}

/** minutes after midnight -> 'HH:MM' (null when out of range). */
function fromMinutes(total) {
  if (!Number.isInteger(total) || total < 0 || total > 24 * 60) return null;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Add minutes to a 'HH:MM' string. Returns null when either input is invalid. */
function addMinutes(time, minutes) {
  const start = toMinutes(time);
  if (start === null) return null;
  return fromMinutes(start + Number(minutes));
}

function minutesBetween(start, end) {
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === null || b === null) return null;
  return b - a;
}

/** End time must be strictly after start time. */
function endAfterStart(start, end) {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes === null || endMinutes === null) return false;
  return endMinutes > startMinutes;
}

/**
 * Half-open interval overlap: [startA, endA) vs [startB, endB).
 * Activities that merely touch (11:00-12:00 and 12:00-13:00) do NOT clash.
 */
function overlaps(startA, endA, startB, endB) {
  const a1 = toMinutes(startA);
  const a2 = toMinutes(endA);
  const b1 = toMinutes(startB);
  const b2 = toMinutes(endB);
  if (a1 === null || a2 === null || b1 === null || b2 === null) return false;
  return a1 < b2 && b1 < a2;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value.trim())) return false;
  const date = new Date(`${value.trim()}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value.trim();
}

module.exports = {
  isValidTime,
  isValidDate,
  toMinutes,
  fromMinutes,
  addMinutes,
  minutesBetween,
  endAfterStart,
  overlaps
};
