/** Append-only audit trail helper. */

function writeAudit(db, userId, action, entity, entityId, details) {
  db.prepare(`
    INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(userId || null, action, entity, entityId === undefined ? null : entityId, details || null);
}

function recentAudit(db, limit = 10) {
  return db.prepare(`
    SELECT al.*, u.username
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.id DESC
    LIMIT ?
  `).all(limit);
}

module.exports = { writeAudit, recentAudit };
