const { z } = require('zod');
const { query } = require('../config/db');
const { verifyPassword } = require('../utils/password');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  newJti,
  REFRESH_EXPIRES_SECONDS,
} = require('../utils/tokens');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function login(req, res) {
  const { email, password } = loginSchema.parse(req.body);

  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, u.status,
            u.can_approve_photos, u.can_view_invoices, u.can_edit_patient_info,
            r.name AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.email = $1`,
    [email.toLowerCase()]
  );
  const user = rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status !== 'Active') {
    return res.status(403).json({ error: 'This account is not active. Contact your lab administrator.' });
  }

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  const accessToken = signAccessToken(user);
  const jti = newJti();
  const refreshToken = signRefreshToken(user, jti);

  await query(
    `INSERT INTO refresh_tokens (user_id, jti, expires_at)
     VALUES ($1, $2, now() + interval '${REFRESH_EXPIRES_SECONDS} seconds')`,
    [user.id, jti]
  );

  let practiceIds = [];
  if (user.role === 'dentist_client') {
    const practiceRows = await query(
      'SELECT practice_id FROM practice_users WHERE user_id = $1',
      [user.id]
    );
    practiceIds = practiceRows.rows.map((r) => r.practice_id);
  }

  return res.json({
    accessToken,
    refreshToken,
    refreshExpiresIn: REFRESH_EXPIRES_SECONDS,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      canApprovePhotos: user.can_approve_photos,
      canViewInvoices: user.can_view_invoices,
      canEditPatientInfo: user.can_edit_patient_info,
      practiceIds,
    },
  });
}

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

async function refresh(req, res) {
  const { refreshToken } = refreshSchema.parse(req.body);

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }

  if (!payload.jti) {
    // Old-format token issued before B10 — no row to check against, reject cleanly.
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }

  // CRITICAL: this WHERE clause scopes to this token's own jti, and nothing
  // else — no table-wide "is anything revoked" check. This is exactly the
  // scoping that must never be loosened (see BUILD_LOG.md B10 entry for why).
  const { rows } = await query(
    'SELECT * FROM refresh_tokens WHERE jti = $1',
    [payload.jti]
  );
  const tokenRow = rows[0];

  if (!tokenRow) {
    return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }

  if (tokenRow.revoked_at) {
    // This exact token was already used/revoked. Distinguish why, using
    // only this row's own revoked_reason — never any other row's state.
    if (tokenRow.revoked_reason === 'rotated') {
      // Someone presented a refresh token that was already rotated away —
      // classic reuse/theft signal. Revoke the entire lineage for this
      // user as a precaution.
      await query(
        `UPDATE refresh_tokens
         SET revoked_at = now(), revoked_reason = 'reuse_detected'
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [tokenRow.user_id]
      );
      return res.status(401).json({ error: 'This session is no longer valid. Please log in again.' });
    }
    return res.status(401).json({ error: 'This session has been signed out.' });
  }

  const { rows: userRows } = await query(
    `SELECT u.id, u.status, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [tokenRow.user_id]
  );
  const user = userRows[0];
  if (!user || user.status !== 'Active') {
    return res.status(401).json({ error: 'Account no longer active.' });
  }

  // Rotate: mint a new jti/row, mark this exact row rotated -> new jti.
  const newTokenJti = newJti();
  await query(
    `UPDATE refresh_tokens
     SET revoked_at = now(), revoked_reason = 'rotated', replaced_by_jti = $2
     WHERE jti = $1`,
    [payload.jti, newTokenJti]
  );
  await query(
    `INSERT INTO refresh_tokens (user_id, jti, expires_at)
     VALUES ($1, $2, now() + interval '${REFRESH_EXPIRES_SECONDS} seconds')`,
    [user.id, newTokenJti]
  );

  const accessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user, newTokenJti);

  return res.json({ accessToken, refreshToken: newRefreshToken });
}

async function logout(req, res) {
  const { refreshToken } = refreshSchema.parse(req.body);

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    // Already invalid/expired — logging out is a no-op success either way.
    return res.status(204).send();
  }

  if (payload.jti) {
    // Scoped to this exact jti only — logging out one session must never
    // touch any other session's row.
    await query(
      `UPDATE refresh_tokens
       SET revoked_at = now(), revoked_reason = 'logout'
       WHERE jti = $1 AND revoked_at IS NULL`,
      [payload.jti]
    );
  }

  return res.status(204).send();
}

async function logoutAll(req, res) {
  // req.user is set by requireAuth on the access token — this revokes
  // every refresh token for that user, e.g. "lost device" flow.
  await query(
    `UPDATE refresh_tokens
     SET revoked_at = now(), revoked_reason = 'logout_all'
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [req.user.id]
  );
  return res.status(204).send();
}

async function me(req, res) {
  return res.json({ user: req.user });
}

module.exports = { login, refresh, logout, logoutAll, me };
