const { verifyAccessToken } = require('../utils/tokens');
const { query } = require('../config/db');

/**
 * Verifies the access token and loads a FRESH copy of the user (role name +
 * portal permission flags) from the DB on every request. We deliberately do not
 * trust role/permissions baked into the JWT payload — an admin revoking a
 * permission should take effect on the user's very next request, not after
 * their token expires.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired access token.' });
    }

    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.status,
              u.can_approve_photos, u.can_view_invoices, u.can_edit_patient_info,
              r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [payload.sub]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }
    if (user.status !== 'Active') {
      return res.status(403).json({ error: 'This account is not active.' });
    }

    // For dentist_client users, attach the practice(s) they belong to — used for
    // server-side tenant isolation on every practice-scoped query.
    if (user.role === 'dentist_client') {
      const practiceRows = await query(
        'SELECT practice_id FROM practice_users WHERE user_id = $1',
        [user.id]
      );
      user.practice_ids = practiceRows.rows.map((r) => r.practice_id);
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Restricts a route to one or more internal roles (owner, office_manager,
 * assistant_technician, designer). Dentist_client is never internal.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

/**
 * Blocks any dentist_client (portal) user — internal-staff-only routes.
 */
function requireInternal(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  if (req.user.role === 'dentist_client') {
    return res.status(403).json({ error: 'This action is restricted to lab staff.' });
  }
  return next();
}

/**
 * Billing/invoice access: internally restricted to Owner + Office Manager only
 * (Assistant/Technician/Designer explicitly blocked per Project Scope §4.7).
 * Portal (dentist_client) billing access is handled separately via
 * requirePortalPermission('can_view_invoices'), not this middleware.
 */
function requireBillingAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  if (!['owner', 'office_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Billing and invoice access is restricted to Owner and Office Manager.' });
  }
  return next();
}

/**
 * Gates a portal (dentist_client) action behind one of the three client-specified
 * per-user boolean flags: can_approve_photos, can_view_invoices, can_edit_patient_info.
 */
function requirePortalPermission(flag) {
  const validFlags = ['can_approve_photos', 'can_view_invoices', 'can_edit_patient_info'];
  if (!validFlags.includes(flag)) {
    throw new Error(`requirePortalPermission: unknown flag "${flag}"`);
  }
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    if (req.user.role !== 'dentist_client') {
      // Internal staff aren't subject to portal permission flags.
      return next();
    }
    if (!req.user[flag]) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireInternal,
  requireBillingAccess,
  requirePortalPermission,
};
