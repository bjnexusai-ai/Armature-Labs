const { z } = require('zod');
const { query } = require('../config/db');
const { verifyPassword } = require('../utils/password');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
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

  // Same generic error whether the email doesn't exist or the password is wrong —
  // don't leak which one it was.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status !== 'Active') {
    return res.status(403).json({ error: 'This account is not active. Contact your lab administrator.' });
  }

  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

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

  const { rows } = await query(
    `SELECT u.id, u.status, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || user.status !== 'Active') {
    return res.status(401).json({ error: 'Account no longer active.' });
  }

  const accessToken = signAccessToken(user);
  return res.json({ accessToken });
}

async function me(req, res) {
  return res.json({ user: req.user });
}

module.exports = { login, refresh, me };
