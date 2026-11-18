# Implementation Notes (Chapter Four material)

**Project:** University Timetable Scheduling System — A Case Study of the University of Ibadan
Distance Learning Centre (UIDLC)
**Document purpose:** report-ready material describing the implemented system, its architecture,
database, algorithms, constraints, test cases and observed results.

> All data used below is synthetic demo data produced by `src/db/seed.js`. No confidential
> institutional data was used.

---

## 4.1 Development environment and tools

| Item | Value used for this implementation |
|---|---|
| Operating system | Cross-platform (developed and verified on Linux; also runs on Windows and macOS) |
| Runtime | Node.js 20+ (verified with Node.js 26 in the build environment) |
| Package manager | npm 10+ |
| Web framework | Express.js 4 |
| Database | SQLite 3 accessed through `better-sqlite3` 12 |
| Templating engine | EJS 3 |
| CSS framework | Bootstrap 5.3 (CDN) |
| Client-side validation | Vanilla JavaScript (`public/js/validate.js`) |
| Session handling | `express-session` 1 |
| Password hashing | `bcrypt` 5 |
| Testing | Jest 29 + Supertest 7 |
| Editor / IDE | Any text editor (VS Code recommended) |
| Version control | Git, GitHub |

Installation and execution commands are listed in `README.md` (sections 5, 8 and 9).

---

## 4.2 System architecture

The system follows a layered Model–View–Controller style architecture inside a single Express
application.

```
+--------------------------------------------------------------+
|  Browser (Bootstrap 5 pages + vanilla JS validation)         |
+-----------------------------+--------------------------------+
                              | HTTP (form posts, GET filters)
+-----------------------------v--------------------------------+
|  Express application (src/app.js)                            |
|  - express-session cookie session                            |
|  - loadCurrentUser / requireLogin / requireRole middleware    |
+-----------------------------+--------------------------------+
                              |
+-----------------------------v--------------------------------+
|  Routes (controllers)                                        |
|  auth | dashboard | masterData | users | timetables | conflicts|
+-----------------------------+--------------------------------+
                              |
+-----------------------------v--------------------------------+
|  Services (business logic)                                   |
|  scheduler | conflictService | assignments | validation       |
|  timeUtils | csv | audit                                     |
+-----------------------------+--------------------------------+
                              |
+-----------------------------v--------------------------------+
|  Data access (better-sqlite3, parameterised SQL)             |
|  schema.sql  ->  data/timetable.db                           |
+--------------------------------------------------------------+
```

**Request flow example (generating a timetable):**

1. The officer submits the generate form (`POST /timetables/generate`).
2. `requireRole('admin','timetable_officer')` verifies the session role.
3. `scheduler.generateSchedule()` loads unscheduled activities, time slots, venues and platforms.
4. Each activity is placed in the first feasible slot/resource combination.
5. `conflictService.runConflictDetection()` re-checks the whole timetable and writes `conflicts`.
6. A `generation_runs` row and an `audit_log` row are inserted.
7. `views/timetables/result.ejs` renders assigned, unassigned and conflicting activities.

**Separation of concerns**

- Views contain no SQL and no scheduling rules.
- Services contain no HTTP objects; the detection functions are pure and unit-testable.
- Routes only read input, call services and choose a response.

---

## 4.3 Database tables and relationships

Database file: `data/timetable.db` (created by `npm run db:init`, populated by `npm run db:seed`).
Schema: `src/db/schema.sql`.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Accounts and roles | `username` UNIQUE, `password_hash`, `role` CHECK (`admin`,`timetable_officer`,`viewer`), `active` |
| `programmes` | Academic programmes | `code` UNIQUE, `name` UNIQUE |
| `levels` | Levels 100–500 | `level_number` UNIQUE |
| `courses` | Course catalogue | `course_code` UNIQUE, `programme_id` FK, `level_id` FK, `is_ges`, `active` |
| `student_groups` | Cohort/group per programme and level | `name` UNIQUE, `programme_id` FK, `level_id` FK, `size` |
| `course_student_groups` | Many-to-many course ↔ group | composite PK (`course_id`,`student_group_id`) |
| `facilitators` | Teaching staff | `name`, `email` UNIQUE, `active` |
| `venues` | Physical rooms/halls | `name` UNIQUE, `centre`, `capacity` |
| `platforms` | Virtual platforms | `name` UNIQUE (e.g. `UIDLC LMS`, `Zoom`) |
| `timetable_types` | The three categories | `code` UNIQUE CHECK (`physical`,`virtual`,`examination`) |
| `time_slots` | Available teaching/exam periods | `date`, `start_time`, `end_time`, UNIQUE triple |
| `assignments` | Activity requests and scheduled activities | `timetable_type_id`, `course_id`, `facilitator_id`, `venue_id`, `platform_id`, `student_group_id`, `date`, `start_time`, `end_time`, `expected_candidates`, `exam_format`, `centre`, `duration_minutes`, `status`, `unassigned_reason` |
| `conflicts` | Detected conflicts | `assignment_id` FK, `related_assignment_ids` (JSON), `conflict_type`, `severity`, `message`, `suggested_fix`, `resolved` |
| `audit_log` | Traceability | `user_id` FK, `action`, `entity`, `entity_id`, `details` |
| `generation_runs` | One row per automatic run | `timetable_type_id`, `requested_by`, counts, `created_at` |

**Relationships**

```
programmes 1 ── n courses n ── 1 levels
programmes 1 ── n student_groups n ── 1 levels
courses n ── n student_groups         (course_student_groups)

timetable_types 1 ── n assignments
courses         1 ── n assignments
facilitators    1 ── n assignments (nullable)
venues          1 ── n assignments (nullable, required for physical/examination)
platforms       1 ── n assignments (nullable, required for virtual)
student_groups  1 ── n assignments (nullable)

assignments 1 ── n conflicts
users       1 ── n audit_log
users       1 ── n generation_runs
```

**Integrity and performance**

- `PRAGMA foreign_keys = ON` is enabled on every connection.
- `CHECK` constraints restrict roles, statuses, severities, the three category codes and the
  `active` flags.
- Indexes exist on `assignments(timetable_type_id)`, `(course_id)`, `(date)`, `(venue_id)`,
  `(facilitator_id)`, `(student_group_id)`, `(status)`, on `conflicts(resolved)`,
  `conflicts(assignment_id)`, `courses(programme_id)`, `courses(level_id)` and `time_slots(date)`.
- Deleting a course or programme that is still referenced raises a foreign-key error, which the
  admin screens catch and report instead of crashing.
- All application SQL uses bound parameters (`?` / `@name`); no string concatenation of user input.

---

## 4.4 Scheduling algorithm pseudocode

```
ALGORITHM GenerateTimetable(category, dateFrom, dateTo, filters, toggles, user)

  IF category does not exist OR dateFrom/dateTo invalid OR dateFrom > dateTo THEN
      RETURN validation error
  END IF

  slots    <- time slots WHERE date BETWEEN dateFrom AND dateTo ORDER BY date, start_time
  IF slots is empty THEN RETURN error "no time slots in range"
  venues   <- active venues
  platforms<- active platforms

  requests <- assignments
              WHERE timetable_type_id = category
                AND status IN ('unscheduled','unassigned')
                [AND course.programme_id = programmeFilter]
                [AND course.level_id   = levelFilter]
                [AND course_id         = courseFilter]

  IF requests is empty THEN RETURN error "no unscheduled activities"

  placed <- all currently scheduled assignments          // other categories included
  assigned <- []; unassigned <- []

  requests <- SORT requests DESC BY constraintScore, ASC BY id
  // constraintScore(exam) = 10000 + expected_candidates
  // constraintScore += 500 when is_ges; += duration*2; += expected_candidates

  FOR EACH request IN requests DO
      reasonList <- []
      result <- NULL

      IF category = 'virtual' THEN
          platform <- request.platform OR first active platform
          FOR EACH slot IN OrderSlots(slots, request.facilitator, placed, toggles) DO
              result <- TryPlace(request, slot, {venue: NULL, platform}, placed, category)
              IF result.ok THEN BREAK ELSE reasonList.APPEND(result.reason)
          END FOR
      ELSE
          venueOrder <- OrderVenues(venues, request)        // capacity filter + centre preference
          IF venueOrder is empty THEN reasonList.APPEND(venueOrder.reason)
          FOR EACH slot IN OrderSlots(...) DO
              FOR EACH venue IN venueOrder.venues DO
                  result <- TryPlace(request, slot, {venue, platform: NULL}, placed, category)
                  IF result.ok THEN BREAK ELSE reasonList.APPEND(result.reason)
              END FOR
              IF result.ok THEN BREAK
          END FOR
      END IF

      IF result.ok THEN
          UPDATE assignment SET date, start_time, end_time, venue_id, platform_id,
                                status='scheduled', unassigned_reason=NULL
          placed.APPEND(assignment)
          assigned.APPEND(assignment)
      ELSE
          UPDATE assignment SET status='unassigned', unassigned_reason = reasonList[0]
          unassigned.APPEND({assignment, reason: reasonList[0]})
      END IF
  END FOR

  conflicts <- RunConflictDetection()
  INSERT generation_runs(category, user, range, |assigned|, |unassigned|, |conflicts|)
  WRITE audit log entry

  RETURN { assigned, unassigned, conflicts }
END ALGORITHM


FUNCTION OrderSlots(slots, facilitator, placed, toggles)
  FOR EACH slot:
      preferred <- (NOT avoidEarly OR start >= 09:00) AND (NOT avoidLate OR end <= 17:00)
      load      <- number of placed activities of this facilitator overlapping the slot
  SORT BY preferred DESC, load ASC, date ASC, start_time ASC, slot.id ASC
  RETURN sorted slots
END FUNCTION


FUNCTION OrderVenues(venues, request)
  IF expected_candidates known THEN
      pool <- venues WHERE capacity >= expected_candidates
      IF pool is empty THEN RETURN error CAPACITY_EXCEEDED
  ELSE pool <- venues
  IF request.centre is set AND some venue matches the centre THEN pool <- matching venues
  SORT BY capacity ASC, name ASC, id ASC
  RETURN pool
END FUNCTION


FUNCTION TryPlace(request, slot, resources, placed, category)
  end <- slot.start_time + request.duration_minutes
  IF end is invalid OR end > slot.end_time THEN RETURN fail INVALID_TIME

  IF category = physical    AND venue is NULL                          THEN RETURN fail MISSING_RESOURCE
  IF category = virtual     AND platform is NULL                       THEN RETURN fail MISSING_RESOURCE
  IF category = examination AND (venue is NULL OR exam_format is NULL) THEN RETURN fail MISSING_RESOURCE
  IF category = examination AND centre is empty                        THEN RETURN fail EXAM_CENTRE_MISSING
  IF capacityCheck(request.expected_candidates, venue.capacity) fails  THEN RETURN fail CAPACITY_EXCEEDED

  FOR EACH other IN placed DO
      IF other.date = slot.date AND Overlaps(other, start, end) THEN
          IF other.venue_id = venue.id                    THEN RETURN fail VENUE_DOUBLE_BOOKING
          IF other.facilitator_id = request.facilitator_id THEN RETURN fail FACILITATOR_DOUBLE_BOOKING
          IF other.student_group_id = request.student_group_id THEN RETURN fail STUDENT_GROUP_CLASH
          IF other.course_id = request.course_id AND other.category = category
                                                          THEN RETURN fail DUPLICATE_ASSIGNMENT
      END IF
  END FOR

  RETURN success(start, end)
END FUNCTION
```

The algorithm is greedy and does **not** backtrack, and it is not an optimisation meta-heuristic.

---

## 4.5 Conflict detection pseudocode

```
FUNCTION DetectConflicts(assignments)

  conflicts <- []
  scheduled <- assignments WHERE status = 'scheduled'

  // ---- per-assignment checks -------------------------------------------
  FOR EACH a IN scheduled DO
      IF date invalid OR times invalid OR end <= start THEN
          ADD conflict(INVALID_TIME, hard, [a.id], message, fix)
          CONTINUE
      END IF

      IF a.category = physical AND a.venue_id IS NULL THEN
          ADD conflict(MISSING_RESOURCE, hard, [a.id])
      END IF
      IF a.category = virtual AND a.platform_id IS NULL THEN
          ADD conflict(MISSING_RESOURCE, hard, [a.id])
      END IF
      IF a.category = examination THEN
          IF a.venue_id IS NULL OR a.exam_format IS NULL THEN
              ADD conflict(MISSING_RESOURCE, hard, [a.id])
          END IF
          IF a.centre is empty THEN
              ADD conflict(EXAM_CENTRE_MISSING, hard, [a.id])
          END IF
      END IF
      IF a.expected_candidates > a.venue_capacity THEN
          ADD conflict(CAPACITY_EXCEEDED, hard, [a.id])
      END IF
  END FOR

  // ---- pairwise checks --------------------------------------------------
  FOR i FROM 0 TO |scheduled|-1 DO
      FOR j FROM i+1 TO |scheduled|-1 DO
          a <- scheduled[i]; b <- scheduled[j]
          IF a.date <> b.date THEN CONTINUE
          IF NOT Overlaps(a.start, a.end, b.start, b.end) THEN CONTINUE

          IF a.venue_id = b.venue_id THEN
              ADD conflict(VENUE_DOUBLE_BOOKING, hard, [a.id, b.id])
          END IF
          IF a.facilitator_id = b.facilitator_id THEN
              ADD conflict(FACILITATOR_DOUBLE_BOOKING, hard, [a.id, b.id])
          END IF
          IF a.student_group_id = b.student_group_id THEN
              ADD conflict(STUDENT_GROUP_CLASH, hard, [a.id, b.id])
          END IF
      END FOR
  END FOR

  // ---- duplicates -------------------------------------------------------
  GROUP scheduled BY (course_id, timetable_type_id, date, start_time)
  FOR EACH group WITH more than one row DO
      ADD conflict(DUPLICATE_ASSIGNMENT, warning, [first.id, other.id])
  END FOR

  RETURN conflicts sorted by assignment id then type
END FUNCTION


FUNCTION Overlaps(startA, endA, startB, endB)
  RETURN startA < endB AND startB < endA        // half-open intervals in minutes
END FUNCTION


FUNCTION RunConflictDetection()
  rows      <- all assignments joined with course, type, venue, facilitator, group, platform
  conflicts <- DetectConflicts(rows)
  TRANSACTION:
      DELETE FROM conflicts WHERE resolved = 0        // resolved rows stay as history
      FOR EACH conflict:
          INSERT INTO conflicts(assignment_id, related_assignment_ids,
                                conflict_type, severity, message, suggested_fix,
                                detected_at, resolved=0)
  RETURN { conflicts, count }
END FUNCTION
```

Each stored conflict therefore records the primary assignment id plus the related ids, the type, a
severity (`hard` for rule breaches, `warning` for duplicates), a human-readable message and a
suggested fix.

---

## 4.6 Implemented constraints

### Hard constraints (enforced by both the scheduler and the detector)

| ID | Constraint | Where |
|---|---|---|
| HC1 | A venue cannot be double-booked at overlapping times | `attemptPlacement`, `findConflicts` |
| HC2 | A facilitator cannot be in two overlapping activities | `attemptPlacement`, `findConflicts` |
| HC3 | A student group cannot be in two overlapping activities | `attemptPlacement`, `findConflicts` |
| HC4 | End time must be after start time and the activity must fit the slot | `validateAssignmentInput`, `attemptPlacement`, `findConflicts` |
| HC5 | Physical sessions require a venue; virtual sessions require a platform | `attemptPlacement`, `validateAssignmentInput`, `findConflicts` |
| HC6 | Examinations require a venue, an exam format and a centre | `attemptPlacement`, `findConflicts` |
| HC7 | Venue capacity must cover expected candidates when both are known | `capacityCheck` |
| HC8 | The same course cannot be scheduled twice for the same category at the same start time | `attemptPlacement`, `findDuplicateAssignments` |

### Soft constraints (affect candidate ordering only)

| ID | Constraint | Toggle |
|---|---|---|
| SC1 | Avoid slots starting before 09:00 | `avoidEarly` |
| SC2 | Avoid slots ending after 17:00 | `avoidLate` |
| SC3 | Prefer slots where the facilitator carries less load | `balanceWorkload` |
| SC4 | Prefer earlier feasible slots deterministically | always on (chronological tie-break) |
| SC5 | Prefer venues in the requested examination centre and the smallest adequate hall | always on |
| SC6 | Reduce long waiting gaps for groups by never creating group overlaps | consequence of HC3 |

---

## 4.7 Test cases T01–T08

Run with `npm test` (Jest + Supertest, in-memory database seeded with the demo data).

| ID | Test case | Input | Expected result | Actual result |
|---|---|---|---|---|
| T01 | Valid course record accepted | `POST /admin/courses` with code `TST101`, title, programme, level | HTTP 302; row present in `courses` with the supplied values | Pass (asserted automatically) — _paste console output_ |
| T02 | Missing required field rejected | `POST /admin/courses` without `course_code` | HTTP 400, message "Course code is required.", no row inserted | Pass — _paste console output_ |
| T03 | Valid sample data generates initial schedule | `POST /timetables/generate` for category `physical`, 2026-02-09 → 2026-02-11 | HTTP 200, "Generation result" page, at least one `scheduled` row, `generation_runs` row stored | Pass — _paste console output_ |
| T04 | Overlapping venue assignment detected | Two activities in `Ibadan Main Auditorium`, 08:00–09:00 and 08:30–09:30 on 2026-03-02, then `POST /conflicts/run` | `VENUE_DOUBLE_BOOKING`, severity `hard`, both assignment ids returned by `GET /api/conflicts` | Pass — _paste console output_ |
| T05 | Overlapping facilitator assignment detected | Same facilitator in two venues, overlapping times on 2026-03-03 | `FACILITATOR_DOUBLE_BOOKING` with both ids | Pass — _paste console output_ |
| T06 | Manual edit saved and rechecked | `POST /timetables/:id/edit` moving an activity into another activity's venue window | HTTP 302, row updated (start 10:30, end 11:30, duration 60), conflict visible on the edit page | Pass — _paste console output_ |
| T07 | Timetable view/filter works | `GET /timetables?category=examination`, `GET /timetables/export.csv?category=physical` | HTTP 200; only examination rows in the JSON API; CSV starts with the header row | Pass — _paste console output_ |
| T08 | Saved timetable data retrievable | `GET /api/timetables` | JSON array whose length equals the number of `scheduled` rows, each with course/date/time fields; viewer can read but gets HTTP 403 when generating | Pass — _paste console output_ |

### Unit tests

| ID | Unit under test | Cases |
|---|---|---|
| U1 | `overlaps()` / `endAfterStart()` / `addMinutes()` / `isValidDate()` | partial overlap, contained interval, adjacent intervals, invalid input, strict ordering |
| U2 | `capacityCheck()` | fits, unknown values, exceeded |
| U3 | `checkTimeWindow()` | end before start, unparsable time, valid window |
| U4 | `findDuplicateAssignments()` | same course/category/date/start flagged; different category or start allowed |
| U5 | Scheduler helpers | most-constrained-first ordering; venue rejection; capacity filter removes small venues |

**Recorded run output** (from the build environment):

```
PASS tests/api.test.js
PASS tests/unit.test.js

Test Suites: 2 passed, 2 total
Tests:       31 passed, 31 total
Time:        1.255 s
```

---

## 4.8 Observed results with the seeded demo data

Generated through the running application (2026-02-09 → 2026-02-11, default toggles):

| Category | Assigned | Unassigned | Notes |
|---|---|---|---|
| Physical / interactive | 10 | 0 | 10 seeded requests placed across 5 venues |
| Virtual interactive | 6 | 0 | Platform assigned automatically (UIDLC LMS / Zoom) |
| Examination | 5 | 1 | GES101 with 500 candidates could not be placed: no venue has capacity for 500 |

Open conflicts after seeding and generation: **2**

1. `VENUE_DOUBLE_BOOKING` — CSC102 and ECO102 both use CBT Hall A on 2026-02-09, 10:00–12:00.
2. `CAPACITY_EXCEEDED` — CSC202 expects 300 candidates but Lecture Room 1 holds 80.

A manual edit that moved CSC101 into the CBT Hall A clash window produced two additional
`VENUE_DOUBLE_BOOKING` conflicts, which the edit page displayed immediately and which the resolve
action could acknowledge.

These numbers come from the demo seed and are reproducible with `npm run db:reset`.

---

## 4.9 Screenshot captions

| # | Figure | Suggested caption |
|---|---|---|
| 1 | Login page | "Figure 4.1: Login page with role-based authentication" |
| 2 | Dashboard | "Figure 4.2: Dashboard showing master-data counts, scheduled activities, open conflicts and recent generation runs" |
| 3 | Courses master data | "Figure 4.3: Course management screen with add/edit form and course list" |
| 4 | Venues master data | "Figure 4.4: Venue management showing centre and capacity used by the capacity constraint" |
| 5 | Time slots | "Figure 4.5: Time slot management used as candidate slots during generation" |
| 6 | Generate form | "Figure 4.6: Timetable generation form with category selection, date range and soft-constraint toggles" |
| 7 | Generation result — assigned | "Figure 4.7: Assigned activities returned by the greedy scheduler" |
| 8 | Generation result — unassigned | "Figure 4.8: Unassigned activities with the reason recorded by the scheduler" |
| 9 | Conflict report | "Figure 4.9: Conflict report showing a venue double booking and a capacity overflow with suggested fixes" |
| 10 | Manual edit + conflict panel | "Figure 4.10: Manual adjustment screen; saving re-runs conflict detection and displays the affected conflicts" |
| 11 | Timetable filter | "Figure 4.11: Timetable search and filter by category, programme, level, venue and date range" |
| 12 | CSV export | "Figure 4.12: Exported CSV timetable opened in a spreadsheet" |
| 13 | Print preview | "Figure 4.13: Print-friendly timetable view" |
| 14 | User management | "Figure 4.14: Administrator user management with role assignment" |
| 15 | Test output | "Figure 4.15: Jest/Supertest output showing T01–T08 and the unit tests passing" |

---

## 4.10 Limitations

1. The scheduler is greedy and never backtracks, so results are feasible but not optimal; a
   different activity ordering can leave fewer activities unassigned.
2. Generation is per category, not a joint optimisation across all three categories.
3. Capacity checking depends on `expected_candidates`; physical sessions without that value are not
   capacity-checked.
4. Examination centre matching is a preference. If no venue exists in the requested centre the
   scheduler uses another venue rather than failing, and the capacity/centre conflict checks remain
   the safety net.
5. Sessions use the default in-memory store, so restarting the server signs everyone out.
6. No CSRF tokens, rate limiting, account lockout, password reset or HTTPS enforcement — deliberate
   scope limits for a student MVP.
7. No pagination or virtual scrolling; fine for the seeded data volume only.
8. SQLite allows a single writer at a time, which limits concurrent use.
9. No time-zone handling: all dates and times are treated as local campus time.
10. Print formatting is browser-dependent.

---

## 4.11 Features not implemented

- Genetic algorithm, tabu search, simulated annealing or any other optimisation meta-heuristic.
- Automatic room allocation by room type/equipment, or travel time between centres.
- Multi-day recurring activities ("every Monday 10:00 for 12 weeks").
- Calendar invitations, e-mail/SMS notifications or `.ics` export.
- Student and facilitator self-service portals, attendance tracking or result processing.
- Workflow approvals (draft → reviewed → published) and timetable versioning/rollback.
- Analytics such as venue utilisation, facilitator workload reports or conflict trend charts.
- Excel/PDF report generation and REST API authentication tokens.
- Deployment automation, containerisation and CI configuration.

These items are stated explicitly so the report does not overclaim the implemented scope.

---

## 4.12 Security measures implemented

| Measure | Implementation |
|---|---|
| Password storage | `bcrypt` hashing with cost factor 10; plaintext passwords are never stored |
| Session management | `express-session` with an HTTP-only, SameSite=Lax cookie; user reloaded from the database on each request so deactivated accounts lose access |
| Role-based access | `requireRole()` guards on every administrative, generation and adjustment route; viewers receive HTTP 403 on write routes |
| SQL injection | All statements parameterised; dynamic filters only add fixed `?` placeholders |
| Authorization of data edits | Assignment edits are limited to `admin` and `timetable_officer` |
| Secrets | Configuration read from `.env`; `.env` and `data/` are git-ignored; only `.env.example` is committed |
| Input validation | Required-field, numeric, date/time and end-after-start checks on both client and server |
| Audit trail | Every state-changing action writes a row to `audit_log` with the acting user |
| Error handling | Central error handler and 404 page; stack traces are not shown to the browser |
