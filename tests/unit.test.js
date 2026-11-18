/**
 * Unit tests for the scheduling and conflict detection helpers.
 * These run without a database.
 */
const { overlaps, endAfterStart, toMinutes, addMinutes, isValidDate } = require('../src/services/timeUtils');
const { capacityCheck, checkTimeWindow } = require('../src/services/validation');
const { findDuplicateAssignments, findConflicts } = require('../src/services/conflictService');
const { sortRequests, orderVenues, attemptPlacement } = require('../src/services/scheduler');

describe('time overlap logic', () => {
  test('detects a partial overlap', () => {
    expect(overlaps('09:00', '11:00', '10:00', '12:00')).toBe(true);
  });

  test('detects a fully contained activity', () => {
    expect(overlaps('09:00', '12:00', '10:00', '11:00')).toBe(true);
  });

  test('back-to-back activities do not overlap', () => {
    expect(overlaps('09:00', '11:00', '11:00', '13:00')).toBe(false);
  });

  test('different days are handled by the caller, but invalid times never overlap', () => {
    expect(overlaps('09:00', '11:00', '', '12:00')).toBe(false);
    expect(overlaps('bad', '11:00', '10:00', '12:00')).toBe(false);
  });

  test('endAfterStart requires a strict ordering', () => {
    expect(endAfterStart('09:00', '10:00')).toBe(true);
    expect(endAfterStart('10:00', '10:00')).toBe(false);
    expect(endAfterStart('11:00', '10:00')).toBe(false);
  });

  test('time arithmetic helpers behave correctly', () => {
    expect(toMinutes('08:30')).toBe(510);
    expect(addMinutes('08:30', 90)).toBe('10:00');
    expect(addMinutes('23:30', 60)).toBeNull();
    expect(isValidDate('2026-02-09')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
  });
});

describe('capacity check', () => {
  test('passes when candidates fit', () => {
    expect(capacityCheck(80, 100).ok).toBe(true);
  });

  test('passes when the values are unknown', () => {
    expect(capacityCheck(null, 100).ok).toBe(true);
    expect(capacityCheck(50, undefined).ok).toBe(true);
  });

  test('fails when candidates exceed the venue capacity', () => {
    const result = capacityCheck(300, 80);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('CAPACITY_EXCEEDED');
  });
});

describe('invalid time check', () => {
  test('rejects an end time before the start time', () => {
    const result = checkTimeWindow('11:00', '09:00');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('INVALID_TIME');
  });

  test('rejects an unparsable time', () => {
    expect(checkTimeWindow('9am', '11:00').ok).toBe(false);
  });

  test('accepts a valid window', () => {
    expect(checkTimeWindow('09:00', '11:00').ok).toBe(true);
  });
});

describe('duplicate assignment check', () => {
  const base = {
    id: 1,
    course_id: 7,
    timetable_type_id: 1,
    date: '2026-02-09',
    start_time: '10:00',
    end_time: '12:00',
    status: 'scheduled'
  };

  test('flags the same course, category, date and start time', () => {
    const duplicates = findDuplicateAssignments([base, { ...base, id: 2 }]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].conflictType).toBe('DUPLICATE_ASSIGNMENT');
    expect(duplicates[0].assignmentIds).toEqual([1, 2]);
  });

  test('allows a different category or start time', () => {
    const duplicates = findDuplicateAssignments([
      base,
      { ...base, id: 2, timetable_type_id: 2 },
      { ...base, id: 3, start_time: '12:00', end_time: '14:00' }
    ]);
    expect(duplicates).toHaveLength(0);
  });
});

describe('conflict detection', () => {
  const venueClash = [
    {
      id: 1, course_id: 1, course_code: 'CSC101', timetable_type_id: 1, type_code: 'physical',
      facilitator_id: 1, venue_id: 2, venue_name: 'CBT Hall A', venue_capacity: 250,
      student_group_id: 1, group_name: 'CSC-100-A', date: '2026-02-09',
      start_time: '10:00', end_time: '12:00', status: 'scheduled'
    },
    {
      id: 2, course_id: 2, course_code: 'ECO101', timetable_type_id: 1, type_code: 'physical',
      facilitator_id: 2, venue_id: 2, venue_name: 'CBT Hall A', venue_capacity: 250,
      student_group_id: 2, group_name: 'ECO-100-A', date: '2026-02-09',
      start_time: '11:00', end_time: '13:00', status: 'scheduled'
    }
  ];

  test('detects a venue double booking with both assignment ids', () => {
    const conflicts = findConflicts(venueClash);
    const venue = conflicts.find((conflict) => conflict.conflictType === 'VENUE_DOUBLE_BOOKING');
    expect(venue).toBeDefined();
    expect(venue.assignmentIds).toEqual([1, 2]);
    expect(venue.severity).toBe('hard');
  });

  test('detects a facilitator double booking', () => {
    const rows = [
      { ...venueClash[0], venue_id: 10, venue_name: 'Room A' },
      { ...venueClash[1], venue_id: 11, venue_name: 'Room B', facilitator_id: 1 }
    ];
    const conflicts = findConflicts(rows);
    expect(conflicts.some((conflict) => conflict.conflictType === 'FACILITATOR_DOUBLE_BOOKING')).toBe(true);
  });

  test('detects a missing venue for a physical session', () => {
    const conflicts = findConflicts([{ ...venueClash[0], venue_id: null, venue_name: null }]);
    expect(conflicts.some((conflict) => conflict.conflictType === 'MISSING_RESOURCE')).toBe(true);
  });

  test('detects a missing examination centre', () => {
    const conflicts = findConflicts([
      {
        ...venueClash[0], id: 9, type_code: 'examination', exam_format: 'CBT', centre: '  '
      }
    ]);
    expect(conflicts.some((conflict) => conflict.conflictType === 'EXAM_CENTRE_MISSING')).toBe(true);
  });
});

describe('greedy scheduler helpers', () => {
  test('sorts examinations with more candidates first', () => {
    const requests = [
      { id: 1, expected_candidates: 50, duration_minutes: 120, is_ges: 0 },
      { id: 2, expected_candidates: 400, duration_minutes: 120, is_ges: 0 },
      { id: 3, expected_candidates: 100, duration_minutes: 120, is_ges: 1 }
    ];
    const sorted = sortRequests(requests, 'examination');
    expect(sorted.map((row) => row.id)).toEqual([2, 3, 1]);
  });

  test('rejects a venue that is already booked', () => {
    const request = {
      id: 1, course_id: 1, timetable_type_id: 1, facilitator_id: 1, student_group_id: 1,
      duration_minutes: 120, expected_candidates: 50
    };
    const slot = { id: 1, date: '2026-02-09', start_time: '10:00', end_time: '12:00' };
    const venue = { id: 2, name: 'CBT Hall A', capacity: 250 };
    const placed = [
      { id: 99, course_id: 5, timetable_type_id: 1, facilitator_id: 7, venue_id: 2, student_group_id: 9,
        date: '2026-02-09', start_time: '11:00', end_time: '13:00' }
    ];
    const result = attemptPlacement(request, slot, { venue }, placed, 'physical');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('VENUE_DOUBLE_BOOKING');
  });

  test('does not offer venues that are too small', () => {
    const result = orderVenues(
      [{ id: 1, name: 'Small', centre: 'Ibadan', capacity: 40 }],
      { expected_candidates: 300, centre: 'Ibadan' }
    );
    expect(result.venues).toHaveLength(0);
    expect(result.reason).toContain('CAPACITY_EXCEEDED');
  });
});
