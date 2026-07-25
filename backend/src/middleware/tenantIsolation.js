/**
 * Non-functional requirement (Project Scope §9.3): "Strict office-level data
 * isolation, enforced server-side." This is intentionally NOT UI-only — every
 * controller that returns practice-scoped data (cases, invoices, etc.) must
 * call this before returning a record to a dentist_client user.
 *
 * Internal staff (owner/office_manager/assistant_technician/designer) bypass
 * this check entirely — they're lab-wide by design.
 */
function assertPracticeAccess(user, practiceId) {
  if (user.role === 'dentist_client') {
    const allowed = (user.practice_ids || []).map(String).includes(String(practiceId));
    if (!allowed) {
      const err = new Error('You do not have access to this practice\'s data.');
      err.status = 403;
      throw err;
    }
  }
}

/**
 * Returns a SQL fragment + params to constrain a query to the current user's
 * practices when they're a dentist_client, or no constraint at all for internal
 * staff. Use as: `WHERE 1=1 ${scope.clause}` with scope.params appended.
 */
function practiceScopeClause(user, paramIndexStart, column = 'practice_id') {
  if (user.role !== 'dentist_client') {
    return { clause: '', params: [] };
  }
  const ids = user.practice_ids && user.practice_ids.length ? user.practice_ids : [-1];
  return {
    clause: ` AND ${column} = ANY($${paramIndexStart}::bigint[])`,
    params: [ids],
  };
}

module.exports = { assertPracticeAccess, practiceScopeClause };
