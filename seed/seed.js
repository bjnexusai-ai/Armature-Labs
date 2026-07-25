require('dotenv').config();
const { pool, query, withTransaction } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');

const DEFAULT_PASSWORD = 'TestPass123!';

async function upsertUser({ fullName, email, role, phone, portalFlags }) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    console.log(`  - ${email} already exists, skipping`);
    return existing.rows[0].id;
  }

  const roleRow = await query('SELECT id FROM roles WHERE name = $1', [role]);
  if (!roleRow.rows[0]) throw new Error(`Role "${role}" not found — did migrations run?`);

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const flags = portalFlags || { can_approve_photos: false, can_view_invoices: false, can_edit_patient_info: false };

  const { rows } = await query(
    `INSERT INTO users (full_name, email, phone, password_hash, role_id,
                         can_approve_photos, can_view_invoices, can_edit_patient_info)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [fullName, email, phone || null, passwordHash, roleRow.rows[0].id,
     flags.can_approve_photos, flags.can_view_invoices, flags.can_edit_patient_info]
  );
  console.log(`  + created ${email} (${role})`);
  return rows[0].id;
}

async function seed() {
  console.log('Seeding Dental Lab CRM — Phase 1 core data...\n');

  console.log('Pre-created accounts (per client deliverables spec, all password: ' + DEFAULT_PASSWORD + '):');
  const ownerId = await upsertUser({ fullName: 'Dana Owner', email: 'owner@dentallab.test', role: 'owner' });
  const managerId = await upsertUser({ fullName: 'Morgan Office-Manager', email: 'manager@dentallab.test', role: 'office_manager' });
  const tech1Id = await upsertUser({ fullName: 'Alex Technician', email: 'tech1@dentallab.test', role: 'assistant_technician' });
  const tech2Id = await upsertUser({ fullName: 'Jordan Technician', email: 'tech2@dentallab.test', role: 'assistant_technician' });
  const designerId = await upsertUser({ fullName: 'Sam Designer', email: 'designer@dentallab.test', role: 'designer' });

  // Link technicians/designer to the technicians table (department/specialty left
  // blank — cosmetic detail, not required for the account to function).
  for (const uid of [tech1Id, tech2Id, designerId]) {
    const exists = await query('SELECT id FROM technicians WHERE user_id = $1', [uid]);
    if (!exists.rows[0]) {
      await query(`INSERT INTO technicians (user_id, status) VALUES ($1, 'Active')`, [uid]);
    }
  }

  console.log('\nExample dental practice + dentist portal user:');
  let practiceId;
  const existingPractice = await query(
    "SELECT id FROM practices WHERE practice_name = 'Bright Smile Dental Clinic'"
  );
  if (existingPractice.rows[0]) {
    practiceId = existingPractice.rows[0].id;
    console.log('  - Bright Smile Dental Clinic already exists, skipping');
  } else {
    const { rows } = await query(
      `INSERT INTO practices (practice_name, city, state, phone, status)
       VALUES ('Bright Smile Dental Clinic', 'Valley Village', 'CA', '555-0100', 'Active')
       RETURNING id`
    );
    practiceId = rows[0].id;
    console.log('  + created Bright Smile Dental Clinic');
  }

  const dentistId = await upsertUser({
    fullName: 'Dr. Smith',
    email: 'dentist@brightsmile.test',
    role: 'dentist_client',
    portalFlags: { can_approve_photos: true, can_view_invoices: true, can_edit_patient_info: true },
  });

  const link = await query(
    'SELECT id FROM practice_users WHERE practice_id = $1 AND user_id = $2',
    [practiceId, dentistId]
  );
  if (!link.rows[0]) {
    await query(
      'INSERT INTO practice_users (practice_id, user_id, is_primary) VALUES ($1, $2, true)',
      [practiceId, dentistId]
    );
    console.log('  + linked Dr. Smith to Bright Smile Dental Clinic (primary contact)');
  }

  console.log('\nExample case:');
  const existingCase = await query('SELECT id FROM cases LIMIT 1');
  if (existingCase.rows[0]) {
    console.log('  - an example case already exists, skipping');
  } else {
    const caseTypeRow = await query("SELECT id FROM case_types WHERE name = 'Crown'");
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 10);

    const { rows } = await query(
      `INSERT INTO cases (practice_id, dentist_id, case_type_id, patient_name,
                           rx_instructions, due_date, assigned_staff_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, case_number`,
      [
        practiceId,
        dentistId,
        caseTypeRow.rows[0].id,
        'Jane Patient',
        'Zirconia crown, tooth #14, shade A2',
        dueDate.toISOString().slice(0, 10),
        tech1Id,
      ]
    );
    console.log(`  + created case ${rows[0].case_number}`);

    await query(
      `INSERT INTO case_status_audit (case_id, changed_by, old_status, new_status, remarks)
       VALUES ($1, $2, NULL, 'Case Entered', 'Initial intake, seeded example case.')`,
      [rows[0].id, ownerId]
    );
  }

  console.log('\nSeed complete.');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
