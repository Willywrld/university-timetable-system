/** Minimal CSV writer used by the timetable export. */

function escapeCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, columns) {
  const header = columns.map((column) => escapeCell(column.label)).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((column) => escapeCell(typeof column.value === 'function' ? column.value(row) : row[column.key]))
        .join(',')
    )
    .join('\n');
  return `${header}\n${body}${body ? '\n' : ''}`;
}

const TIMETABLE_COLUMNS = [
  { label: 'Date', key: 'date' },
  { label: 'Start', key: 'start_time' },
  { label: 'End', key: 'end_time' },
  { label: 'Category', key: 'type_name' },
  { label: 'Course code', key: 'course_code' },
  { label: 'Course title', key: 'course_title' },
  { label: 'Facilitator', key: 'facilitator_name' },
  { label: 'Student group', key: 'group_name' },
  { label: 'Venue', key: 'venue_name' },
  { label: 'Centre', value: (row) => row.centre || row.venue_centre || '' },
  { label: 'Platform', key: 'platform_name' },
  { label: 'Expected candidates', key: 'expected_candidates' },
  { label: 'Exam format', key: 'exam_format' }
];

module.exports = { toCsv, TIMETABLE_COLUMNS };
