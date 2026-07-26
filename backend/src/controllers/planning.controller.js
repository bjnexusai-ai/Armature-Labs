const { z } = require('zod');
const { query, withTransaction } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────
// Capacity planning — technician_shifts + equipment_bookings (§11 Phase 3:
// "capacity planning, prevents double-booking machine time against
// cases"). Overlap prevention is done as a check-then-insert inside a
// single transaction (see migration 0032 header for why this project
// doesn't use a Postgres EXCLUDE constraint here) — this closes the
// TOCTOU race a plain check-then-insert without a transaction would have.
// ─────────────────────────────────────────────────────────────────────────

const timeWindowSchema = {
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
};

function assertValidWindow(startsAt, endsAt) {
  if (new Date(endsAt) <= new Date(startsAt)) {
    const err = new Error('endsAt must be after startsAt.');
    err.status = 400;
    throw err;
  }
}

// ── Technician shifts ──────────────────────────────────────────────────

const createShiftSchema = z
  .object({
    technicianId: z.coerce.number().int().positive(),
    ...timeWindowSchema,
    notes: z.string().optional(),
  })
  .strict();

async function createShift(req, res) {
  const input = createShiftSchema.parse(req.body);
  assertValidWindow(input.startsAt, input.endsAt);

  const shift = await withTransaction(async (client) => {
    const techRow = await client.query('SELECT id FROM technicians WHERE id = $1', [input.technicianId]);
    if (!techRow.rows[0]) {
      const err = new Error('technicianId does not reference an existing technician.');
      err.status = 400;
      throw err;
    }

    const overlap = await client.query(
      `SELECT id FROM technician_shifts
       WHERE technician_id = $1 AND starts_at < $3 AND ends_at > $2
       FOR UPDATE`,
      [input.technicianId, input.startsAt, input.endsAt]
    );
    if (overlap.rows.length > 0) {
      const err = new Error('This technician already has a shift that overlaps this time window.');
      err.status = 409;
      throw err;
    }

    const { rows } = await client.query(
      `INSERT INTO technician_shifts (technician_id, starts_at, ends_at, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, technician_id, starts_at, ends_at, notes, created_by, created_at`,
      [input.technicianId, input.startsAt, input.endsAt, input.notes || null, req.user.id]
    );
    return rows[0];
  });

  return res.status(201).json({ shift });
}

async function listShifts(req, res) {
  const { technicianId } = req.query;
  if (technicianId) {
    const { rows } = await query(
      `SELECT id, technician_id, starts_at, ends_at, notes, created_by, created_at
       FROM technician_shifts WHERE technician_id = $1 ORDER BY starts_at`,
      [technicianId]
    );
    return res.json({ shifts: rows });
  }
  const { rows } = await query(
    `SELECT id, technician_id, starts_at, ends_at, notes, created_by, created_at
     FROM technician_shifts ORDER BY starts_at`
  );
  return res.json({ shifts: rows });
}

// ── Equipment bookings ─────────────────────────────────────────────────

const createBookingSchema = z
  .object({
    equipmentId: z.coerce.number().int().positive(),
    caseId: z.coerce.number().int().positive().optional(),
    ...timeWindowSchema,
    notes: z.string().optional(),
  })
  .strict();

async function createBooking(req, res) {
  const input = createBookingSchema.parse(req.body);
  assertValidWindow(input.startsAt, input.endsAt);

  const booking = await withTransaction(async (client) => {
    const equipRow = await client.query('SELECT id FROM equipment WHERE id = $1', [input.equipmentId]);
    if (!equipRow.rows[0]) {
      const err = new Error('equipmentId does not reference existing equipment.');
      err.status = 400;
      throw err;
    }
    if (input.caseId) {
      const caseRow = await client.query('SELECT id FROM cases WHERE id = $1', [input.caseId]);
      if (!caseRow.rows[0]) {
        const err = new Error('caseId does not reference an existing case.');
        err.status = 400;
        throw err;
      }
    }

    const overlap = await client.query(
      `SELECT id FROM equipment_bookings
       WHERE equipment_id = $1 AND starts_at < $3 AND ends_at > $2
       FOR UPDATE`,
      [input.equipmentId, input.startsAt, input.endsAt]
    );
    if (overlap.rows.length > 0) {
      const err = new Error('This equipment already has a booking that overlaps this time window.');
      err.status = 409;
      throw err;
    }

    const { rows } = await client.query(
      `INSERT INTO equipment_bookings (equipment_id, case_id, booked_by, starts_at, ends_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, equipment_id, case_id, booked_by, starts_at, ends_at, notes, created_at`,
      [input.equipmentId, input.caseId || null, req.user.id, input.startsAt, input.endsAt, input.notes || null]
    );
    return rows[0];
  });

  return res.status(201).json({ booking });
}

async function listBookings(req, res) {
  const { equipmentId } = req.query;
  if (equipmentId) {
    const { rows } = await query(
      `SELECT id, equipment_id, case_id, booked_by, starts_at, ends_at, notes, created_at
       FROM equipment_bookings WHERE equipment_id = $1 ORDER BY starts_at`,
      [equipmentId]
    );
    return res.json({ bookings: rows });
  }
  const { rows } = await query(
    `SELECT id, equipment_id, case_id, booked_by, starts_at, ends_at, notes, created_at
     FROM equipment_bookings ORDER BY starts_at`
  );
  return res.json({ bookings: rows });
}

module.exports = { createShift, listShifts, createBooking, listBookings };
