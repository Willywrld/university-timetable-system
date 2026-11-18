/**
 * Integration tests T01 - T08 (Jest + Supertest).
 * The database is an in-memory SQLite database seeded with the demo data.
 */
process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-only-secret';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const config = require('../src/config');
const { getDb } = require('../src/db');
const { seedDatabase } = require('../src/db/seed');
const app = require('../src/app');

let adminAgent;
let officerAgent;

function db() {
  return getDb();
}

function firstId(sql, ...params) {
  return db().prepare(sql).get(...params).id;
}

async function loginAs(account) {
  const agent = request.agent(app);
  const response = await agent
    .post('/login')
    .type('form')
    .send({ username: account.username, password: account.password });
  expect(response.status).toBe(302);
  return agent;
}

beforeAll(async () => {
  const result = seedDatabase(db());
  expect(result.skipped).toBe(false);
  adminAgent = await loginAs(config.seedAccounts.admin);
  officerAgent = await loginAs(config.seedAccounts.officer);
});

describe('T01 valid course record accepted', () => {
  test('admin creates a course and it is stored', async () => {
    const programmeId = firstId('SELECT id FROM programmes WHERE code = ?', 'CSC');
    const levelId = firstId('SELECT id FROM levels WHERE level_number = ?', 100);

    const response = await adminAgent.post('/admin/courses').type('form').send({
      course_code: 'TST101',
      course_title: 'Software Testing Fundamentals',
      programme_id: programmeId,
      level_id: levelId,
      is_ges: '1',
      active: '1'
    });

    expect(response.status).toBe(302);
    const course = db().prepare('SELECT * FROM courses WHERE course_code = ?').get('TST101');
    expect(course).toBeDefined();
    expect(course.course_title).toBe('Software Testing Fundamentals');
    expect(course.is_ges).toBe(1);
  });
});

describe('T02 missing required field rejected', () => {
  test('a course without a course code is rejected with a 400 and no row is created', async () => {
    const before = db().prepare('SELECT COUNT(*) AS n FROM courses').get().n;
    const programmeId = firstId('SELECT id FROM programmes WHERE code = ?', 'CSC');
    const levelId = firstId('SELECT id FROM levels WHERE level_number = ?', 100);

    const response = await adminAgent.post('/admin/courses').type('form').send({
      course_code: '',
      course_title: 'Course Without Code',
      programme_id: programmeId,
      level_id: levelId
    });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Course code is required');
    const after = db().prepare('SELECT COUNT(*) AS n FROM courses').get().n;
    expect(after).toBe(before);
  });
});

describe('T03 valid sample data generates initial schedule', () => {
  test('the officer generates a physical timetable', async () => {
    const typeId = firstId('SELECT id FROM timetable_types WHERE code = ?', 'physical');

    const response = await officerAgent.post('/timetables/generate').type('form').send({
      timetable_type_id: typeId,
      date_from: '2026-02-09',
      date_to: '2026-02-11',
      avoidEarly: '1',
      avoidLate: '1',
      balanceWorkload: '1'
    });

    expect(response.status).toBe(200);
    expect(response.text).toContain('Generation result');

    const scheduled = db().prepare(
      "SELECT COUNT(*) AS n FROM assignments WHERE timetable_type_id = ? AND status = 'scheduled'"
    ).get(typeId).n;
    expect(scheduled).toBeGreaterThan(0);

    const run = db().prepare('SELECT * FROM generation_runs ORDER BY id DESC LIMIT 1').get();
    expect(run.timetable_type_id).toBe(typeId);
    expect(run.assigned_count).toBeGreaterThan(0);
  });
});

describe('T04 overlapping venue assignment detected', () => {
  let firstAssignmentId;
  let secondAssignmentId;

  test('two activities in the same venue at the same time are flagged', async () => {
    const physicalType = firstId('SELECT id FROM timetable_types WHERE code = ?', 'physical');
    const cscCourse = firstId('SELECT id FROM courses WHERE course_code = ?', 'CSC301');
    const ecoCourse = firstId('SELECT id FROM courses WHERE course_code = ?', 'ECO301');
    const facilitatorA = firstId('SELECT id FROM facilitators WHERE name = ?', 'Dr. Halima Bello');
    const facilitatorB = firstId('SELECT id FROM facilitators WHERE name = ?', 'Mr. Emeka Obi');
    const venue = firstId('SELECT id FROM venues WHERE name = ?', 'Ibadan Main Auditorium');

    const first = await officerAgent.post('/timetables').type('form').send({
      timetable_type_id: physicalType,
      course_id: cscCourse,
      facilitator_id: facilitatorA,
      venue_id: venue,
      date: '2026-03-02',
      start_time: '08:00',
      end_time: '09:00'
    });
    expect(first.status).toBe(302);
    firstAssignmentId = Number(first.headers.location.split('/')[2]);

    const second = await officerAgent.post('/timetables').type('form').send({
      timetable_type_id: physicalType,
      course_id: ecoCourse,
      facilitator_id: facilitatorB,
      venue_id: venue,
      date: '2026-03-02',
      start_time: '08:30',
      end_time: '09:30'
    });
    expect(second.status).toBe(302);
    secondAssignmentId = Number(second.headers.location.split('/')[2]);

    const check = await officerAgent.post('/conflicts/run').type('form').send({});
    expect(check.status).toBe(302);

    const response = await officerAgent.get('/api/conflicts');
    expect(response.status).toBe(200);
    const conflict = response.body.find(
      (item) =>
        item.conflict_type === 'VENUE_DOUBLE_BOOKING' &&
        item.assignmentIds.includes(firstAssignmentId) &&
        item.assignmentIds.includes(secondAssignmentId)
    );
    expect(conflict).toBeDefined();
    expect(conflict.severity).toBe('hard');
  });
});

describe('T05 overlapping facilitator assignment detected', () => {
  test('one facilitator in two venues at the same time is flagged', async () => {
    const physicalType = firstId('SELECT id FROM timetable_types WHERE code = ?', 'physical');
    const courseA = firstId('SELECT id FROM courses WHERE course_code = ?', 'CSC401');
    const courseB = firstId('SELECT id FROM courses WHERE course_code = ?', 'ECO401');
    const facilitator = firstId('SELECT id FROM facilitators WHERE name = ?', 'Mrs. Chiamaka Nwosu');
    const venueA = firstId('SELECT id FROM venues WHERE name = ?', 'Lecture Room 1');
    const venueB = firstId('SELECT id FROM venues WHERE name = ?', 'Lecture Room 2');

    const first = await officerAgent.post('/timetables').type('form').send({
      timetable_type_id: physicalType,
      course_id: courseA,
      facilitator_id: facilitator,
      venue_id: venueA,
      date: '2026-03-03',
      start_time: '08:00',
      end_time: '09:00'
    });
    const firstIdValue = Number(first.headers.location.split('/')[2]);

    const second = await officerAgent.post('/timetables').type('form').send({
      timetable_type_id: physicalType,
      course_id: courseB,
      facilitator_id: facilitator,
      venue_id: venueB,
      date: '2026-03-03',
      start_time: '08:30',
      end_time: '09:30'
    });
    const secondIdValue = Number(second.headers.location.split('/')[2]);

    await officerAgent.post('/conflicts/run').type('form').send({});
    const response = await officerAgent.get('/api/conflicts');
    const conflict = response.body.find(
      (item) =>
        item.conflict_type === 'FACILITATOR_DOUBLE_BOOKING' &&
        item.assignmentIds.includes(firstIdValue) &&
        item.assignmentIds.includes(secondIdValue)
    );
    expect(conflict).toBeDefined();
  });
});

describe('T06 manual edit saved and rechecked', () => {
  test('editing an activity saves the change and re-runs conflict detection', async () => {
    const physicalType = firstId('SELECT id FROM timetable_types WHERE code = ?', 'physical');
    const course = firstId('SELECT id FROM courses WHERE course_code = ?', 'CSC102');
    const venue = firstId('SELECT id FROM venues WHERE name = ?', 'Lagos Study Centre Hall');

    const created = await officerAgent.post('/timetables').type('form').send({
      timetable_type_id: physicalType,
      course_id: course,
      venue_id: venue,
      date: '2026-03-05',
      start_time: '08:00',
      end_time: '09:00'
    });
    const id = Number(created.headers.location.split('/')[2]);

    // Edit it so that it now clashes with the T05 activity at the same venue?
    // The T05 activities use Ibadan venues, so instead clash with a new partner.
    const partner = await officerAgent.post('/timetables').type('form').send({
      timetable_type_id: physicalType,
      course_id: firstId('SELECT id FROM courses WHERE course_code = ?', 'ECO202'),
      venue_id: venue,
      date: '2026-03-05',
      start_time: '10:00',
      end_time: '11:00'
    });
    const partnerId = Number(partner.headers.location.split('/')[2]);

    const edit = await officerAgent.post(`/timetables/${id}/edit`).type('form').send({
      timetable_type_id: physicalType,
      course_id: course,
      venue_id: venue,
      date: '2026-03-05',
      start_time: '10:30',
      end_time: '11:30',
      status: 'scheduled'
    });

    expect(edit.status).toBe(302);

    const saved = db().prepare('SELECT * FROM assignments WHERE id = ?').get(id);
    expect(saved.start_time).toBe('10:30');
    expect(saved.end_time).toBe('11:30');
    expect(saved.duration_minutes).toBe(60);

    const response = await officerAgent.get('/api/conflicts');
    const conflict = response.body.find(
      (item) =>
        item.conflict_type === 'VENUE_DOUBLE_BOOKING' &&
        item.assignmentIds.includes(id) &&
        item.assignmentIds.includes(partnerId)
    );
    expect(conflict).toBeDefined();

    // The edit page shows the conflict immediately.
    const page = await officerAgent.get(`/timetables/${id}/edit`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('VENUE_DOUBLE_BOOKING');
  });
});

describe('T07 timetable view and filter', () => {
  test('filtering by category returns only that category', async () => {
    const response = await officerAgent.get('/timetables?category=examination');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Examination');

    const rows = await officerAgent.get('/api/timetables?category=examination');
    expect(rows.status).toBe(200);
    expect(rows.body.length).toBeGreaterThan(0);
    expect(rows.body.every((row) => row.type_code === 'examination')).toBe(true);
  });

  test('the CSV export returns a file with a header row', async () => {
    const response = await officerAgent.get('/timetables/export.csv?category=physical');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text.split('\n')[0]).toContain('Course code');
  });
});

describe('T08 saved timetable data retrievable', () => {
  test('the JSON API returns the stored timetable with readable fields', async () => {
    const response = await officerAgent.get('/api/timetables');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);

    const row = response.body[0];
    expect(row).toHaveProperty('course_code');
    expect(row).toHaveProperty('date');
    expect(row).toHaveProperty('start_time');
    expect(row).toHaveProperty('type_name');

    const stored = db().prepare('SELECT COUNT(*) AS n FROM assignments WHERE status = ?').get('scheduled').n;
    expect(stored).toBe(response.body.length);
  });

  test('a viewer can read but not generate', async () => {
    const viewer = await loginAs(config.seedAccounts.viewer);
    const read = await viewer.get('/timetables');
    expect(read.status).toBe(200);

    const generate = await viewer.post('/timetables/generate').type('form').send({});
    expect(generate.status).toBe(403);
  });
});
