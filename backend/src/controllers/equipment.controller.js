const { z } = require('zod');
const { query } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────
// Equipment — milling machines, printers, furnaces, scanners (§11 Phase 3).
// Owner/Office Manager manage the catalog; any internal staff can log
// maintenance (a technician servicing a machine shouldn't need a manager
// to log it for them) and read the catalog/history.
//
// Date columns (next_maintenance_due_date, next_due_date) are explicitly
// cast to ::text in every SELECT. Without this, `pg` returns Postgres
// `date` columns as JS Date objects, and res.json() serializes those as
// full ISO timestamps (e.g. "2027-01-15T00:00:00.000Z") instead of a plain
// date string — wrong for a column with no time component. This is a
// pre-existing pattern gap in the codebase (see accounts.controller.js's
// contract_start_date, which has the same underlying issue but was never
// caught because no test asserts its returned format) — fixed here for
// new code rather than propagated, but not touched elsewhere this session.
// ─────────────────────────────────────────────────────────────────────────

const EQUIPMENT_SELECT = `
  SELECT id, name, equipment_type, serial_number, status,
         next_maintenance_due_date::text AS next_maintenance_due_date,
         created_at, updated_at
  FROM equipment
`;

const createEquipmentSchema = z
  .object({
    name: z.string().min(1).max(150),
    equipmentType: z.enum(['Milling Machine', 'Printer', 'Furnace', 'Scanner', 'Other']),
    serialNumber: z.string().max(100).optional(),
  })
  .strict();

async function createEquipment(req, res) {
  const input = createEquipmentSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO equipment (name, equipment_type, serial_number)
     VALUES ($1, $2, $3)
     RETURNING id, name, equipment_type, serial_number, status,
               next_maintenance_due_date::text AS next_maintenance_due_date, created_at, updated_at`,
    [input.name, input.equipmentType, input.serialNumber || null]
  );
  return res.status(201).json({ equipment: rows[0] });
}

async function listEquipment(req, res) {
  const { status } = req.query;
  if (status) {
    const { rows } = await query(`${EQUIPMENT_SELECT} WHERE status = $1 ORDER BY name`, [status]);
    return res.json({ equipment: rows });
  }
  const { rows } = await query(`${EQUIPMENT_SELECT} ORDER BY name`);
  return res.json({ equipment: rows });
}

async function getEquipment(req, res) {
  const { rows } = await query(`${EQUIPMENT_SELECT} WHERE id = $1`, [req.params.id]);
  if (!rows[0]) {
    return res.status(404).json({ error: 'Equipment not found.' });
  }
  return res.json({ equipment: rows[0] });
}

const updateStatusSchema = z
  .object({ status: z.enum(['Active', 'Under Maintenance', 'Retired']) })
  .strict();

async function updateEquipmentStatus(req, res) {
  const input = updateStatusSchema.parse(req.body);
  const { rows } = await query(
    `UPDATE equipment SET status = $1 WHERE id = $2
     RETURNING id, name, equipment_type, serial_number, status,
               next_maintenance_due_date::text AS next_maintenance_due_date, created_at, updated_at`,
    [input.status, req.params.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'Equipment not found.' });
  }
  return res.json({ equipment: rows[0] });
}

// ─────────────────────────────────────────────────────────────────────────
// Maintenance logs
// ─────────────────────────────────────────────────────────────────────────

const createMaintenanceLogSchema = z
  .object({
    logType: z.enum(['Routine', 'Repair', 'Inspection']),
    nextDueDate: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

async function createMaintenanceLog(req, res) {
  const equipmentId = req.params.id;
  const input = createMaintenanceLogSchema.parse(req.body);

  const equipmentRow = await query('SELECT id FROM equipment WHERE id = $1', [equipmentId]);
  if (!equipmentRow.rows[0]) {
    return res.status(404).json({ error: 'Equipment not found.' });
  }

  const { rows } = await query(
    `INSERT INTO equipment_maintenance_logs (equipment_id, log_type, performed_by, next_due_date, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, equipment_id, log_type, performed_by, performed_at,
               next_due_date::text AS next_due_date, notes, created_at`,
    [equipmentId, input.logType, req.user.id, input.nextDueDate || null, input.notes || null]
  );

  // Bugfix (caught by our own integration tests): only touch
  // equipment.next_maintenance_due_date when this log actually supplied a
  // nextDueDate. Earlier draft unconditionally set it, which meant a
  // Repair/Inspection log with no next date silently wiped out a real
  // future due date a prior Routine log had already set.
  if (input.nextDueDate) {
    await query('UPDATE equipment SET next_maintenance_due_date = $1 WHERE id = $2', [
      input.nextDueDate,
      equipmentId,
    ]);
  }

  return res.status(201).json({ maintenanceLog: rows[0] });
}

async function listMaintenanceLogs(req, res) {
  const { rows } = await query(
    `SELECT id, equipment_id, log_type, performed_by, performed_at,
            next_due_date::text AS next_due_date, notes, created_at
     FROM equipment_maintenance_logs WHERE equipment_id = $1 ORDER BY performed_at DESC`,
    [req.params.id]
  );
  return res.json({ maintenanceLogs: rows });
}

module.exports = {
  createEquipment,
  listEquipment,
  getEquipment,
  updateEquipmentStatus,
  createMaintenanceLog,
  listMaintenanceLogs,
};
