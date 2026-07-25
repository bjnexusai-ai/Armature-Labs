const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const { hashPassword } = require('../utils/password');

const createUserSchema = z.object({
  fullName: z.string().min(1).max(150),
  email: z.string().email().max(150),
  phone: z.string().max(20).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.enum(['owner', 'office_manager', 'assistant_technician', 'designer', 'dentist_client']),
  // Only meaningful when role === 'dentist_client'
  practiceId: z.number().int().positive().optional(),
  isPrimaryContact: z.boolean().optional().default(false),
  canApprovePhotos: z.boolean().optional().default(false),
  canViewInvoices: z.boolean().optional().default(false),
  canEditPatientInfo: z.boolean().optional().default(false),
});

/**
 * Creates a login account. Restricted to owner/office_manager (enforced by
 * requireRole in the route). If role is dentist_client, also links the user
 * to a practice via practice_users and stamps the three portal permission
 * flags per the client's own §8 field spec.
 */
async function createUser(req, res) {
  const input = createUserSchema.parse(req.body);

  if (input.role === 'dentist_client' && !input.practiceId) {
    return res.status(400).json({ error: 'practiceId is required when role is dentist_client.' });
  }

  const passwordHash = await hashPassword(input.password);

  const result = await withTransaction(async (client) => {
    const roleRow = await client.query('SELECT id FROM roles WHERE name = $1', [input.role]);
    if (!roleRow.rows[0]) {
      const err = new Error(`Unknown role "${input.role}".`);
      err.status = 400;
      throw err;
    }

    const userRow = await client.query(
      `INSERT INTO users
         (full_name, email, phone, password_hash, role_id,
          can_approve_photos, can_view_invoices, can_edit_patient_info)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, full_name, email, phone, status, created_at`,
      [
        input.fullName,
        input.email.toLowerCase(),
        input.phone || null,
        passwordHash,
        roleRow.rows[0].id,
        input.role === 'dentist_client' ? input.canApprovePhotos : false,
        input.role === 'dentist_client' ? input.canViewInvoices : false,
        input.role === 'dentist_client' ? input.canEditPatientInfo : false,
      ]
    );
    const user = userRow.rows[0];

    if (input.role === 'dentist_client') {
      await client.query(
        `INSERT INTO practice_users (practice_id, user_id, is_primary)
         VALUES ($1, $2, $3)`,
        [input.practiceId, user.id, input.isPrimaryContact]
      );
    }

    if (input.role === 'assistant_technician' || input.role === 'designer') {
      await client.query(
        `INSERT INTO technicians (user_id, status) VALUES ($1, 'Active')`,
        [user.id]
      );
    }

    return user;
  });

  return res.status(201).json({ user: { ...result, role: input.role } });
}

async function listUsers(req, res) {
  const { rows } = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.status, r.name AS role,
            u.can_approve_photos, u.can_view_invoices, u.can_edit_patient_info,
            u.last_login_at, u.created_at
     FROM users u
     JOIN roles r ON r.id = u.role_id
     ORDER BY u.created_at DESC`
  );
  return res.json({ users: rows });
}

module.exports = { createUser, listUsers };
