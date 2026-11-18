/* Client-side form validation (Bootstrap 5 pattern) + time sanity check. */
(function () {
  'use strict';

  function toMinutes(value) {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(value || '')) return null;
    var parts = value.split(':');
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  document.querySelectorAll('form.needs-validation').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      var start = form.querySelector('input[name="start_time"]');
      var end = form.querySelector('input[name="end_time"]');
      if (start && end) {
        var startMinutes = toMinutes(start.value);
        var endMinutes = toMinutes(end.value);
        var valid = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes;
        end.setCustomValidity(valid ? '' : 'End time must be after start time.');
      }
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add('was-validated');
    });
  });

  document.querySelectorAll('input[name="start_time"], input[name="end_time"]').forEach(function (input) {
    input.addEventListener('input', function () {
      input.setCustomValidity('');
    });
  });
})();
