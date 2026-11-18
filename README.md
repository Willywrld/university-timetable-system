# University Timetable Scheduling System

A case study of the **University of Ibadan Distance Learning Centre (UIDLC)**.

A final-year project MVP that generates, stores, checks and publishes timetables for three
categories of activity: **physical/interactive sessions**, **virtual interactive sessions** and
**examinations**. It combines automatic timetable generation (deterministic rule-based greedy
algorithm), manual adjustment, conflict detection, search/filter, CSV export, an audit trail and
role-based access control.

> All programmes, courses, facilitators, venues and activities in this repository are **synthetic
> sample data** created for the project. No real student, staff or institutional data is included.

---

## 1. Overview

Distance learning centres run several parallel timetables at once: face-to-face sessions at study
centres, online sessions on a learning platform, and examinations (CBT, written, practical) at
designated centres. Preparing these by hand leads to double-booked venues, facilitators scheduled
in two places, student groups clashing, and examinations booked into rooms that are too small.

This system provides one place to:

1. maintain the reference data (programmes, levels, courses, student groups, facilitators, venues,
   platforms, time slots);
2. automatically schedule unscheduled activities for one category at a time;
3. detect conflicts (both during generation and after manual edits);
4. adjust assignments manually with an immediate re-check;
5. search, filter, print and export the final timetable as CSV.

The scheduling component is a **greedy, rule-based algorithm**. It is not a genetic algorithm,
tabu search, simulated annealing or any other optimisation meta-heuristic, and the project does not
claim to be one.

---

## 2. Features

| Area | What is implemented |
|---|---|
| Roles | `admin` (everything, including users and master data), `timetable_officer` (generate, create and adjust activities, run checks), `viewer` (read-only timetable and conflict viewing) |
| Authentication | Username + bcrypt password hash, `express-session` cookie session, role guard middleware |
| Timetable categories | Physical/interactive, virtual interactive, examination (seeded as `timetable_types`) |
| Automatic generation | Deterministic greedy scheduler, most-constrained-first ordering, soft-constraint toggles, unassigned activities with a reason |
| Conflict detection | Venue double booking, facilitator double booking, student group clash, capacity exceeded, invalid time, missing resource, examination centre missing, duplicate assignment |
| Manual adjustment | Create/edit date, start/end time, venue, platform, facilitator, centre, expected candidates, exam format; save triggers a full re-check |
| Conflict workflow | Conflict report page, suggested fixes, resolve/acknowledge action, per-activity conflict panel |
| Search / filter | Category, course, programme, level, venue, platform, date range and free-text search |
| Output | Readable timetable table, print-friendly CSS, CSV export of the current filter |
| Administration | Full CRUD for programmes, levels, courses, student groups, facilitators, venues, platforms and time slots; user management |
| Audit | Every create/update/delete, generation run, conflict check, resolve, login and logout is written to `audit_log` |
| Dashboard | Counts of courses, venues, facilitators, scheduled and unassigned activities, open conflicts, plus recent generation runs and recent conflicts |
| Tests | Jest + Supertest: T01–T08 integration tests and unit tests for overlap, capacity, invalid time and duplicate detection |

---

## 3. Technology stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 or newer |
| Web framework | Express.js 4 |
| Database | SQLite via `better-sqlite3` (synchronous, file based) |
| Templating | EJS |
| Styling | Bootstrap 5 (CDN) + a small custom stylesheet |
| Client-side validation | Vanilla JavaScript (Bootstrap validation pattern) |
| Sessions | `express-session` (default in-memory store) |
| Password hashing | `bcrypt` |
| Configuration | `dotenv` + `.env` |
| Tests | Jest + Supertest |
| Export | CSV generated server-side |

---

## 4. Repository structure

```
university-timetable-system/
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── README.md
├── IMPLEMENTATION_NOTES.md
├── server.js
├── public/
│   ├── css/style.css
│   └── js/validate.js
├── src/
│   ├── app.js                     Express app (sessions, views, routers)
│   ├── config.js                  .env driven configuration
│   ├── db/
│   │   ├── index.js               SQLite connection (better-sqlite3)
│   │   ├── schema.sql             Tables, foreign keys, indexes
│   │   ├── seed.js                Synthetic demo data
│   │   ├── init.js                npm run db:init
│   │   └── reset.js               npm run db:reset
│   ├── middleware/
│   │   └── auth.js                requireLogin / requireRole / loadCurrentUser
│   ├── routes/
│   │   ├── auth.js                Login, logout
│   │   ├── dashboard.js           Dashboard counts and recent activity
│   │   ├── masterData.js          Generic CRUD for the eight reference tables
│   │   ├── users.js               Admin user management
│   │   ├── timetables.js          View, filter, generate, edit, CSV, JSON API
│   │   └── conflicts.js           Conflict report, re-check, resolve
│   └── services/
│       ├── scheduler.js           Greedy rule-based scheduler
│       ├── conflictService.js     Conflict detection and storage
│       ├── assignments.js         Assignment queries + validation + save
│       ├── validation.js          Capacity / time-window rules
│       ├── timeUtils.js           Time and overlap helpers
│       ├── csv.js                 CSV writer
│       └── audit.js               Audit log helper
├── views/
│   ├── partials/header.ejs, footer.ejs
│   ├── login.ejs
│   ├── dashboard.ejs
│   ├── error.ejs
│   ├── master/list.ejs            Generic master-data screen
│   ├── users/index.ejs
│   ├── timetables/index.ejs       Timetable view / search / filter
│   ├── timetables/generate.ejs
│   ├── timetables/result.ejs
│   ├── timetables/form.ejs        Manual create / adjust
│   ├── timetables/setup.ejs
│   └── conflicts/index.ejs
└── tests/
    ├── api.test.js                T01–T08 (Jest + Supertest)
    └── unit.test.js               Overlap, capacity, invalid time, duplicates
```

---

## 5. Setup

### Prerequisites

- Node.js **20 or newer** (`node -v`)
- npm (installed with Node.js)
- No separate database server is required; SQLite is embedded.

### Installation

```bash
git clone [YOUR_GITHUB_REPO_URL]
cd university-timetable-system
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `.env` if you want a different port, database path or session secret.

### Create and seed the database

```bash
npm run db:init     # creates data/timetable.db and applies schema.sql
npm run db:seed     # inserts the synthetic demo data
```

Both commands are idempotent in the sense that seeding is skipped when users already exist. To
start from a clean demo database at any time:

```bash
npm run db:reset    # deletes the local database and reseeds it (development only)
```

### Run

```bash
npm start           # http://localhost:3000
# or
npm run dev         # restarts automatically when a file changes
```

### Test

```bash
npm test            # all Jest suites (unit + integration)
npm run test:unit   # tests/unit.test.js only
npm run test:api    # tests/api.test.js only
```

The integration suite uses an in-memory SQLite database (`DB_PATH=:memory:`), so it never touches
`data/timetable.db`.

---

## 6. `.env.example` explained

| Variable | Purpose | Development value |
|---|---|---|
| `PORT` | HTTP port Express binds to | `3000` |
| `DB_PATH` | SQLite file location, relative to the project root | `./data/timetable.db` |
| `SESSION_SECRET` | Secret used to sign the session cookie; replace it before any deployment | placeholder |
| `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` | Seeded administrator account | `admin` / `Admin@1234` |
| `DEFAULT_OFFICER_USERNAME` / `DEFAULT_OFFICER_PASSWORD` | Seeded timetable officer account | `officer` / `Officer@1234` |
| `DEFAULT_VIEWER_USERNAME` / `DEFAULT_VIEWER_PASSWORD` | Seeded read-only account | `viewer` / `Viewer@1234` |
| `NODE_ENV` | `development` or `production` | `development` |

Generate a strong session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env` is listed in `.gitignore`. Only `.env.example` (with placeholder values) is committed.

---

## 7. Default development accounts

Created by `npm run db:seed`. **Development only** — change these before any real deployment.

| Role | Username | Password | Can do |
|---|---|---|---|
| admin | `admin` | `Admin@1234` | Everything: users, master data, generation, adjustment, conflicts |
| timetable_officer | `officer` | `Officer@1234` | Generate timetables, create/adjust activities, run and resolve conflict checks, view master data |
| viewer | `viewer` | `Viewer@1234` | Read-only timetable, search/filter, CSV export, conflict report |

The passwords can be changed in `.env` before seeding, or later through **Users** (admin) /
the seeded reset field on the user management page.

---

## 8. How the scheduler works

The scheduler (`src/services/scheduler.js`) is deterministic: the same input data always produces
the same timetable.

1. Validate the request (category, date range, filters).
2. Load the selected category and every activity in it with status `unscheduled` or `unassigned`.
3. Sort activities **most constrained first**: examinations with large candidate numbers, then GES
   courses shared by many groups, then long activities; the assignment id is the stable tie-breaker.
4. For each activity, try time slots in a fixed order (preferred hours first, then the facilitator's
   lighter slots, then chronological order) and, for each slot, try venues/platforms in a fixed
   order (same centre first, then smallest adequate capacity, then name).
5. Assign the first slot/resource combination that violates no hard constraint.
6. Otherwise mark the activity `unassigned` and record the reason (for example
   `CAPACITY_EXCEEDED: no venue has capacity for 500 candidates`).
7. Re-run full conflict detection and store the result.
8. Display the assignments, the unassigned activities with reasons, and the conflict report.

### Hard constraints

- No venue double booking at overlapping times.
- No facilitator assigned to overlapping activities.
- No student group in two overlapping activities.
- End time must be after start time, and the activity must fit inside the time slot.
- Required resources by category: physical → venue; virtual → platform; examination → venue,
  exam format and centre.
- Venue capacity must cover expected candidates when both values are known.

### Soft constraints (ordering only)

- Avoid slots starting before 09:00 (toggle).
- Avoid slots ending after 17:00 (toggle).
- Prefer slots where the facilitator has less load (toggle).
- Prefer earlier feasible slots deterministically.
- Group members are never double-booked, so long gaps are reduced only indirectly.

Soft constraints never override a hard constraint; they only change the order in which candidate
slots are tried.

### Conflict types

`VENUE_DOUBLE_BOOKING`, `FACILITATOR_DOUBLE_BOOKING`, `STUDENT_GROUP_CLASH`, `CAPACITY_EXCEEDED`,
`INVALID_TIME`, `MISSING_RESOURCE`, `EXAM_CENTRE_MISSING`, `DUPLICATE_ASSIGNMENT`.

Each conflict stores the affected assignment ids, the type, a severity (`hard` or `warning`), a
human-readable message and a suggested fix.

---

## 9. Automated tests

`npm test` runs 31 assertions across two files.

| ID | Test | Where |
|---|---|---|
| T01 | Valid course record accepted and stored | `tests/api.test.js` |
| T02 | Missing required field rejected (HTTP 400, no row created) | `tests/api.test.js` |
| T03 | Valid sample data generates an initial physical schedule | `tests/api.test.js` |
| T04 | Overlapping venue assignment detected | `tests/api.test.js` |
| T05 | Overlapping facilitator assignment detected | `tests/api.test.js` |
| T06 | Manual edit saved and conflict detection re-run | `tests/api.test.js` |
| T07 | Timetable view/filter works (and CSV export) | `tests/api.test.js` |
| T08 | Saved timetable data retrievable through the JSON API | `tests/api.test.js` |
| U1 | Time overlap logic (partial, contained, adjacent, invalid) | `tests/unit.test.js` |
| U2 | Capacity check (fits, unknown, exceeded) | `tests/unit.test.js` |
| U3 | Invalid time check (end before start, unparsable) | `tests/unit.test.js` |
| U4 | Duplicate assignment check | `tests/unit.test.js` |
| U5 | Scheduler helper behaviour (ordering, venue rejection) | `tests/unit.test.js` |

Last recorded run: **2 suites passed, 31 tests passed**.

---

## 10. Screenshots checklist

Capture these for Chapter Four (see `IMPLEMENTATION_NOTES.md` for suggested captions):

- [ ] Login page
- [ ] Dashboard with counts and recent generation runs
- [ ] Master data screen (courses) showing add/edit form and table
- [ ] Master data screen (venues) showing capacity and centre
- [ ] Time slots screen
- [ ] Generate timetable form with category and soft-constraint toggles
- [ ] Generation result page: assigned activities
- [ ] Generation result page: unassigned activities with reasons
- [ ] Conflict report showing `VENUE_DOUBLE_BOOKING` and `CAPACITY_EXCEEDED`
- [ ] Manual edit form with the "Conflicts for this activity" panel
- [ ] Timetable view filtered by category
- [ ] Timetable view filtered by programme/level/date
- [ ] CSV file opened in a spreadsheet
- [ ] Print preview of the timetable
- [ ] User management screen (admin only)
- [ ] `npm test` output in the terminal

---

## 11. Mapping of features to the project write-up

| Write-up section | Implementation evidence |
|---|---|
| Chapter 1: background and problem | Introduction in this README; manual-scheduling problems addressed by conflict detection |
| Chapter 3: system analysis and requirements | Three roles, three timetable categories, the feature table above |
| Chapter 3: functional requirements | Routes in `src/routes/`, screens in `views/` |
| Chapter 3: database design | `src/db/schema.sql`, section 4.3 of `IMPLEMENTATION_NOTES.md` |
| Chapter 3/4: algorithm design | `src/services/scheduler.js`, pseudocode in `IMPLEMENTATION_NOTES.md` |
| Chapter 4: system implementation | This repository, screenshots checklist |
| Chapter 4: testing | `tests/api.test.js` (T01–T08), `tests/unit.test.js`, section 4.7 of the notes |
| Chapter 4: constraints | Hard/soft constraint list above and in the notes |
| Chapter 5: conclusion and limitations | Limitations below and section 4.10 of the notes |

---

## 12. Limitations

- **Greedy, not optimal.** The scheduler assigns the first feasible slot/resource combination. It
  never backtracks, so it can leave activities unassigned when a different ordering would succeed.
- **Single category per run.** Generation is run one category at a time; it does not optimise across
  physical, virtual and examination timetables simultaneously.
- **Capacity uses expected candidates only.** When candidates are unknown, no capacity check is made.
- **Centre matching is a preference, not a rule.** For examinations, venues in the requested centre
  are preferred; if none exists, another venue is used and the centre field is kept as entered.
- **No authentication hardening beyond the project scope.** Sessions use the default in-memory
  store (restarting the server logs everyone out), there is no CSRF token, no rate limiting and no
  password reset by email. Cookies are not marked `secure` because the project runs over HTTP.
- **No pagination.** Lists render every row; fine for the sample size, not for thousands of records.
- **No email/notification integration**, no student self-service, no room-utilisation analytics.
- **SQLite single-writer.** Adequate for a departmental tool, not for a large concurrent deployment.
- **CSV export only.** No Excel, PDF or calendar (`.ics`) output.

---

## 13. Synthetic data notice

Every record in `src/db/seed.js` is invented for demonstration: 3 programmes, levels 100–500,
24 courses (including GES courses), 10 student groups, 6 facilitators, 5 venues with capacities,
2 platforms (including `UIDLC LMS`), 3 timetable categories, 12 time slots over three days,
24 activity requests and 3 pre-scheduled activities that deliberately demonstrate a venue clash and
a capacity overflow. The `@dlc.ui.edu.ng` e-mail addresses are placeholders. No confidential UIDLC
data is used anywhere in this repository.

---

## 14. GitHub

Repository URL placeholder: **[YOUR_GITHUB_REPO_URL]**

```bash
git init
git add .
git commit -m "University Timetable Scheduling System - UIDLC case study"
git branch -M main
git remote add origin [YOUR_GITHUB_REPO_URL]
git push -u origin main
```

Before pushing, confirm that `.env`, `data/` and `node_modules/` are **not** staged
(`git status`); `.gitignore` already excludes them.

---

## 15. Academic note

This is a student MVP built for a final-year project. It is intentionally simple and readable so
that every design decision can be explained in Chapter Four. It is not production software, and
the README does not claim features that are not implemented.
