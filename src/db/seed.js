/**
 * Synthetic seed data for the University of Ibadan Distance Learning Centre
 * case study. NO real student, staff or institutional data is used.
 *
 * CLI: npm run db:seed
 */
const bcrypt = require('bcrypt');
const config = require('../config');
const { runConflictDetection } = require('../services/conflictService');

const PROGRAMMES = [
  ['CSC', 'B.Sc. Computer Science'],
  ['ECO', 'B.Sc. Economics'],
  ['GCE', 'B.Ed. Guidance and Counselling']
];

const COURSES = [
  ['CSC101', 'Introduction to Computing', 'CSC', 100, 0],
  ['CSC102', 'Programming Fundamentals', 'CSC', 100, 0],
  ['CSC201', 'Data Structures and Algorithms', 'CSC', 200, 0],
  ['CSC202', 'Computer Architecture', 'CSC', 200, 0],
  ['CSC301', 'Database Systems', 'CSC', 300, 0],
  ['CSC302', 'Operating Systems', 'CSC', 300, 0],
  ['CSC401', 'Software Engineering', 'CSC', 400, 0],
  ['CSC402', 'Artificial Intelligence', 'CSC', 400, 0],
  ['CSC501', 'Project Management', 'CSC', 500, 0],
  ['ECO101', 'Principles of Economics', 'ECO', 100, 0],
  ['ECO102', 'Introduction to Statistics', 'ECO', 100, 0],
  ['ECO201', 'Microeconomics', 'ECO', 200, 0],
  ['ECO202', 'Macroeconomics', 'ECO', 200, 0],
  ['ECO301', 'Development Economics', 'ECO', 300, 0],
  ['ECO401', 'Econometrics', 'ECO', 400, 0],
  ['ECO501', 'Public Finance', 'ECO', 500, 0],
  ['GCE101', 'Introduction to Guidance and Counselling', 'GCE', 100, 0],
  ['GCE201', 'Career Counselling', 'GCE', 200, 0],
  ['GCE301', 'Group Counselling Techniques', 'GCE', 300, 0],
  ['GCE401', 'Counselling Practicum', 'GCE', 400, 0],
  ['GES101', 'Communication in English', 'CSC', 100, 1],
  ['GES102', 'Nigerian Peoples and Culture', 'ECO', 100, 1],
  ['GES201', 'Entrepreneurial Studies', 'GCE', 200, 1],
  ['GES301', 'Peace Studies and Conflict Resolution', 'CSC', 300, 1]
];

const STUDENT_GROUPS = [
  ['CSC-100-A', 'CSC', 100, 130],
  ['CSC-200-A', 'CSC', 200, 95],
  ['CSC-300-A', 'CSC', 300, 80],
  ['CSC-400-A', 'CSC', 400, 60],
  ['ECO-100-A', 'ECO', 100, 110],
  ['ECO-200-A', 'ECO', 200, 85],
  ['ECO-300-A', 'ECO', 300, 70],
  ['GCE-100-A', 'GCE', 100, 55],
  ['GCE-200-A', 'GCE', 200, 50],
  ['GES-100-A', 'CSC', 100, 300]
];

const FACILITATORS = [
  ['Dr. Adebayo Ogunleye', 'a.ogunleye@dlc.ui.edu.ng'],
  ['Mrs. Chiamaka Nwosu', 'c.nwosu@dlc.ui.edu.ng'],
  ['Dr. Ibrahim Suleiman', 'i.suleiman@dlc.ui.edu.ng'],
  ['Prof. Funmilayo Adeyemi', 'f.adeyemi@dlc.ui.edu.ng'],
  ['Mr. Emeka Obi', 'e.obi@dlc.ui.edu.ng'],
  ['Dr. Halima Bello', 'h.bello@dlc.ui.edu.ng']
];

const VENUES = [
  ['CBT Hall A', 'Ibadan', 250],
  ['Lecture Room 1', 'Ibadan', 80],
  ['Lecture Room 2', 'Ibadan', 60],
  ['Lagos Study Centre Hall', 'Lagos', 120],
  ['Ibadan Main Auditorium', 'Ibadan', 400]
];

const PLATFORMS = [['UIDLC LMS'], ['Zoom']];

const TIMETABLE_TYPES = [
  ['physical', 'Physical / Interactive Session', 'Face-to-face sessions held in a physical venue.'],
  ['virtual', 'Virtual Interactive Session', 'Online sessions delivered through a virtual platform.'],
  ['examination', 'Examination', 'CBT, written or practical examinations held at a centre.']
];

const SLOT_DATES = ['2026-02-09', '2026-02-10', '2026-02-11'];
const SLOT_TIMES = [
  ['08:00', '10:00'],
  ['10:00', '12:00'],
  ['12:00', '14:00'],
  ['14:00', '16:00']
];

// [courseCode, facilitatorIndex, groupName, durationMinutes]
const PHYSICAL_REQUESTS = [
  ['CSC101', 0, 'CSC-100-A', 120],
  ['CSC201', 1, 'CSC-200-A', 120],
  ['CSC301', 2, 'CSC-300-A', 120],
  ['CSC401', 3, 'CSC-400-A', 120],
  ['ECO101', 4, 'ECO-100-A', 120],
  ['ECO201', 5, 'ECO-200-A', 120],
  ['ECO301', 1, 'ECO-300-A', 120],
  ['GCE101', 0, 'GCE-100-A', 120],
  ['GCE201', 2, 'GCE-200-A', 120],
  ['GES101', 3, 'GES-100-A', 120]
];

// [courseCode, facilitatorIndex, groupName, platformName, durationMinutes]
const VIRTUAL_REQUESTS = [
  ['CSC202', 1, 'CSC-200-A', 'UIDLC LMS', 90],
  ['CSC302', 2, 'CSC-300-A', 'Zoom', 90],
  ['ECO202', 4, 'ECO-200-A', 'UIDLC LMS', 90],
  ['ECO401', 5, 'ECO-300-A', 'Zoom', 90],
  ['GCE301', 3, 'GCE-200-A', 'UIDLC LMS', 90],
  ['GES201', 0, 'GES-100-A', 'UIDLC LMS', 90]
];

// [courseCode, facilitatorIndex, groupName, candidates, format, centre, durationMinutes]
const EXAM_REQUESTS = [
  ['CSC101', 0, 'CSC-100-A', 120, 'CBT', 'Ibadan', 120],
  ['CSC301', 2, 'CSC-300-A', 80, 'CBT', 'Ibadan', 120],
  ['ECO101', 4, 'ECO-100-A', 110, 'written', 'Ibadan', 120],
  ['ECO401', 5, 'ECO-300-A', 60, 'written', 'Lagos', 120],
  ['GCE201', 2, 'GCE-200-A', 50, 'practical', 'Ibadan', 120],
  ['GES101', 3, 'GES-100-A', 500, 'CBT', 'Ibadan', 120]
];

function seedDatabase(db) {
  const existing = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  if (existing > 0) {
    return { skipped: true };
  }

  const ids = { programmes: {}, levels: {}, courses: {}, groups: {}, facilitators: [], venues: {}, platforms: {}, types: {} };

  const seed = db.transaction(() => {
    // ---- users -----------------------------------------------------------
    const insertUser = db.prepare(`
      INSERT INTO users (username, full_name, email, password_hash, role, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const accounts = [
      ['admin', config.seedAccounts.admin],
      ['timetable_officer', config.seedAccounts.officer],
      ['viewer', config.seedAccounts.viewer]
    ];
    for (const [role, account] of accounts) {
      insertUser.run(
        account.username,
        account.fullName,
        account.email,
        bcrypt.hashSync(account.password, 10),
        role
      );
    }

    // ---- programmes, levels, courses ------------------------------------
    const insertProgramme = db.prepare('INSERT INTO programmes (name, code) VALUES (?, ?)');
    for (const [code, name] of PROGRAMMES) {
      ids.programmes[code] = Number(insertProgramme.run(name, code).lastInsertRowid);
    }

    const insertLevel = db.prepare('INSERT INTO levels (level_number) VALUES (?)');
    for (const level of [100, 200, 300, 400, 500]) {
      ids.levels[level] = Number(insertLevel.run(level).lastInsertRowid);
    }

    const insertCourse = db.prepare(`
      INSERT INTO courses (course_code, course_title, programme_id, level_id, is_ges, active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    for (const [code, title, programme, level, isGes] of COURSES) {
      ids.courses[code] = Number(
        insertCourse.run(code, title, ids.programmes[programme], ids.levels[level], isGes).lastInsertRowid
      );
    }

    // ---- student groups and course/group links ---------------------------
    const insertGroup = db.prepare(`
      INSERT INTO student_groups (name, programme_id, level_id, size) VALUES (?, ?, ?, ?)
    `);
    for (const [name, programme, level, size] of STUDENT_GROUPS) {
      ids.groups[name] = Number(
        insertGroup.run(name, ids.programmes[programme], ids.levels[level], size).lastInsertRowid
      );
    }

    const linkGroup = db.prepare(`
      INSERT OR IGNORE INTO course_student_groups (course_id, student_group_id) VALUES (?, ?)
    `);
    for (const [code, , programme, level, isGes] of COURSES) {
      const groupName = isGes ? 'GES-100-A' : `${programme}-${level}-A`;
      if (ids.groups[groupName]) {
        linkGroup.run(ids.courses[code], ids.groups[groupName]);
      }
    }

    // ---- facilitators, venues, platforms --------------------------------
    const insertFacilitator = db.prepare('INSERT INTO facilitators (name, email) VALUES (?, ?)');
    for (const [name, email] of FACILITATORS) {
      ids.facilitators.push(Number(insertFacilitator.run(name, email).lastInsertRowid));
    }

    const insertVenue = db.prepare('INSERT INTO venues (name, centre, capacity) VALUES (?, ?, ?)');
    for (const [name, centre, capacity] of VENUES) {
      ids.venues[name] = Number(insertVenue.run(name, centre, capacity).lastInsertRowid);
    }

    const insertPlatform = db.prepare('INSERT INTO platforms (name) VALUES (?)');
    for (const [name] of PLATFORMS) {
      ids.platforms[name] = Number(insertPlatform.run(name).lastInsertRowid);
    }

    // ---- timetable types and time slots ---------------------------------
    const insertType = db.prepare('INSERT INTO timetable_types (code, name, description) VALUES (?, ?, ?)');
    for (const [code, name, description] of TIMETABLE_TYPES) {
      ids.types[code] = Number(insertType.run(code, name, description).lastInsertRowid);
    }

    const insertSlot = db.prepare('INSERT INTO time_slots (date, start_time, end_time) VALUES (?, ?, ?)');
    for (const date of SLOT_DATES) {
      for (const [start, end] of SLOT_TIMES) {
        insertSlot.run(date, start, end);
      }
    }

    // ---- assignment requests -------------------------------------------
    const insertRequest = db.prepare(`
      INSERT INTO assignments
        (timetable_type_id, course_id, facilitator_id, venue_id, platform_id, student_group_id,
         date, start_time, end_time, expected_candidates, exam_format, centre, duration_minutes,
         status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, 'unscheduled', 1, datetime('now'))
    `);

    const groupSize = (name) => {
      const row = STUDENT_GROUPS.find((group) => group[0] === name);
      return row ? row[3] : null;
    };

    for (const [course, facilitator, group, duration] of PHYSICAL_REQUESTS) {
      insertRequest.run(
        ids.types.physical,
        ids.courses[course],
        ids.facilitators[facilitator],
        null,
        null,
        ids.groups[group],
        groupSize(group),
        null,
        null,
        duration
      );
    }

    for (const [course, facilitator, group, platform, duration] of VIRTUAL_REQUESTS) {
      insertRequest.run(
        ids.types.virtual,
        ids.courses[course],
        ids.facilitators[facilitator],
        null,
        ids.platforms[platform],
        ids.groups[group],
        groupSize(group),
        null,
        null,
        duration
      );
    }

    for (const [course, facilitator, group, candidates, format, centre, duration] of EXAM_REQUESTS) {
      insertRequest.run(
        ids.types.examination,
        ids.courses[course],
        ids.facilitators[facilitator],
        null,
        null,
        ids.groups[group],
        candidates,
        format,
        centre,
        duration
      );
    }

    // ---- a few already scheduled rows so the conflict report is not empty -
    const insertScheduled = db.prepare(`
      INSERT INTO assignments
        (timetable_type_id, course_id, facilitator_id, venue_id, platform_id, student_group_id,
         date, start_time, end_time, expected_candidates, exam_format, centre, duration_minutes,
         status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 1, datetime('now'), datetime('now'))
    `);

    // Two physical sessions sharing CBT Hall A at the same time (venue clash).
    insertScheduled.run(
      ids.types.physical, ids.courses.CSC102, ids.facilitators[1], ids.venues['CBT Hall A'],
      ids.groups['CSC-100-A'], '2026-02-09', '10:00', '12:00', 130, null, null, 120
    );
    insertScheduled.run(
      ids.types.physical, ids.courses.ECO102, ids.facilitators[2], ids.venues['CBT Hall A'],
      ids.groups['ECO-100-A'], '2026-02-09', '10:00', '12:00', 110, null, null, 120
    );

    // An examination booked into a room that is too small for its candidates.
    insertScheduled.run(
      ids.types.examination, ids.courses.CSC202, ids.facilitators[1], ids.venues['Lecture Room 1'],
      ids.groups['CSC-200-A'], '2026-02-10', '14:00', '16:00', 300, 'CBT', 'Ibadan', 120
    );
  });

  seed();

  // Populate the conflict report immediately so the dashboard is not empty.
  const detection = runConflictDetection(db);

  const counts = {
    users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
    programmes: db.prepare('SELECT COUNT(*) AS n FROM programmes').get().n,
    courses: db.prepare('SELECT COUNT(*) AS n FROM courses').get().n,
    venues: db.prepare('SELECT COUNT(*) AS n FROM venues').get().n,
    facilitators: db.prepare('SELECT COUNT(*) AS n FROM facilitators').get().n,
    activities: db.prepare('SELECT COUNT(*) AS n FROM assignments').get().n,
    conflicts: detection.count
  };

  return { skipped: false, counts };
}

module.exports = { seedDatabase };

if (require.main === module) {
  const { getDb } = require('./index');
  const db = getDb();
  const result = seedDatabase(db);
  if (result.skipped) {
    console.log('Database already contains users - seed skipped.');
  } else {
    console.log('Seed data inserted:', result.counts);
    console.log('Development logins are documented in README.md and .env.example');
  }
}
