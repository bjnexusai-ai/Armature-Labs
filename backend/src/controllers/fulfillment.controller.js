const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const { assertPracticeAccess } = require('../middleware/tenantIsolation');
const { TERMINAL_STATUS } = require('../utils/caseStatus');
const notifications = require('../services/notifications');

// ─────────────────────────────────────────────────────────────────────────
// Shipments — case-scoped: POST/GET /api/cases/:id/shipments
// Not case-scoped: PATCH /api/fulfillment/shipments/:id/status
//
// Per migrations/0021_shipments.js: creation is an explicit staff action,
// never auto-fired off the case status machine. Status updates
// (Preparing -> Shipped -> Delivered, or -> Returned) are a separate,
// explicit staff action too — same reasoning, this session doesn't touch
// caseStatusTransition.js, so a shipment reaching "Delivered" does NOT
// itself push the case's current_status to "Delivered"; staff still do
// that via the existing PATCH /api/cases/:id/status, same as every other
// forward move. What this DOES do is fire the notification-table entries
// ("Case Shipped Out" / "Case Delivered" -> Dental Office) directly off the
// shipment status change, since that's the more accurate moment for a
// shipment-specific notification than the case-status endpoint.
// ─────────────────────────────────────────────────────────────────────────

const createShipmentSchema = z
  .object({
    carrier: z.string().max(100).optional(),
    trackingNumber: z.string().max(100).optional(),
  })
  .strict();

async function createShipment(req, res) {
  const caseId = req.params.id;
  const input = createShipmentSchema.parse(req.body);

  const caseRow = await query('SELECT id FROM cases WHERE id = $1', [caseId]);
  if (!caseRow.rows[0]) {
    return res.status(404).json({ error: 'Case not found.' });
  }

  const { rows } = await query(
    `INSERT INTO shipments (case_id, carrier, tracking_number, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, case_id, carrier, tracking_number, status, shipped_at, delivered_at, created_by, created_at`,
    [caseId, input.carrier || null, input.trackingNumber || null, req.user.id]
  );

  return res.status(201).json({ shipment: rows[0] });
}

async function listShipments(req, res) {
  const caseId = req.params.id;

  const caseRow = await query('SELECT id, practice_id FROM cases WHERE id = $1', [caseId]);
  const caseRecord = caseRow.rows[0];
  if (!caseRecord) {
    return res.status(404).json({ error: 'Case not found.' });
  }
  assertPracticeAccess(req.user, caseRecord.practice_id);

  const { rows } = await query(
    `SELECT id, case_id, carrier, tracking_number, status, shipped_at, delivered_at, created_by, created_at
     FROM shipments WHERE case_id = $1 ORDER BY created_at DESC`,
    [caseId]
  );
  return res.json({ shipments: rows });
}

const SHIPMENT_NOTIFY_EVENT = { Shipped: 'case_shipped_out', Delivered: 'case_delivered' };

const updateShipmentStatusSchema = z
  .object({
    status: z.enum(['Preparing', 'Shipped', 'Delivered', 'Returned']),
    carrier: z.string().max(100).optional(),
    trackingNumber: z.string().max(100).optional(),
  })
  .strict();

async function updateShipmentStatus(req, res) {
  const shipmentId = req.params.id;
  const input = updateShipmentStatusSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const shipmentRow = await client.query(
      'SELECT id, case_id, status FROM shipments WHERE id = $1 FOR UPDATE',
      [shipmentId]
    );
    const shipment = shipmentRow.rows[0];
    if (!shipment) {
      const err = new Error('Shipment not found.');
      err.status = 404;
      throw err;
    }

    const caseRow = await client.query('SELECT practice_id FROM cases WHERE id = $1', [shipment.case_id]);

    const setClauses = ['status = $1'];
    const params = [input.status];
    if (input.carrier !== undefined) {
      params.push(input.carrier);
      setClauses.push(`carrier = $${params.length}`);
    }
    if (input.trackingNumber !== undefined) {
      params.push(input.trackingNumber);
      setClauses.push(`tracking_number = $${params.length}`);
    }
    if (input.status === 'Shipped') {
      setClauses.push('shipped_at = now()');
    }
    if (input.status === 'Delivered') {
      setClauses.push('delivered_at = now()');
    }
    params.push(shipmentId);

    const updatedRow = await client.query(
      `UPDATE shipments SET ${setClauses.join(', ')} WHERE id = $${params.length}
       RETURNING id, case_id, carrier, tracking_number, status, shipped_at, delivered_at, created_by, created_at`,
      params
    );

    return { shipment: updatedRow.rows[0], practiceId: caseRow.rows[0].practice_id };
  });

  const event = SHIPMENT_NOTIFY_EVENT[input.status];
  if (event) {
    const recipients = await query(
      `SELECT u.id FROM users u
       JOIN practice_users pu ON pu.user_id = u.id
       WHERE pu.practice_id = $1`,
      [result.practiceId]
    );
    if (recipients.rows.length) {
      await notifications.notify({
        event,
        recipientUserIds: recipients.rows.map((r) => r.id),
        payload: { caseId: result.shipment.case_id, shipmentId: result.shipment.id },
      });
    }
  }

  return res.json({ shipment: result.shipment });
}

// ─────────────────────────────────────────────────────────────────────────
// Warranty claims — case-scoped: POST/GET /api/cases/:id/warranty-claims
// Not case-scoped: PATCH /api/fulfillment/warranty-claims/:id/resolve
//
// Per migrations/0022_warranty_claims.js: openable only against a
// TERMINAL_STATUS (Delivered) case, checked here (read-only import, no
// state-machine edits). filed_by can be internal staff or a dentist_client
// with tenant access — same access shape as approvals' tenant check.
// ─────────────────────────────────────────────────────────────────────────

const createWarrantyClaimSchema = z.object({ description: z.string().min(1) }).strict();

async function createWarrantyClaim(req, res) {
  const caseId = req.params.id;
  const input = createWarrantyClaimSchema.parse(req.body);

  const caseRow = await query('SELECT id, practice_id, current_status FROM cases WHERE id = $1', [caseId]);
  const caseRecord = caseRow.rows[0];
  if (!caseRecord) {
    return res.status(404).json({ error: 'Case not found.' });
  }
  assertPracticeAccess(req.user, caseRecord.practice_id);

  if (caseRecord.current_status !== TERMINAL_STATUS) {
    const err = new Error(`A warranty claim can only be filed against a case in "${TERMINAL_STATUS}" status.`);
    err.status = 409;
    throw err;
  }

  const { rows } = await query(
    `INSERT INTO warranty_claims (case_id, filed_by, description)
     VALUES ($1, $2, $3)
     RETURNING id, case_id, filed_by, description, status, resolution_notes, resolved_by, resolved_at, created_at`,
    [caseId, req.user.id, input.description]
  );
  const claim = rows[0];

  // Not in the original notification table (Session 5 addition) — the more
  // defensible default is to alert the same audience as any other
  // case-lifecycle exception: the case's assigned staff.
  const staffRow = await query('SELECT assigned_staff_id FROM cases WHERE id = $1', [caseId]);
  const assignedStaffId = staffRow.rows[0] && staffRow.rows[0].assigned_staff_id;
  if (assignedStaffId) {
    await notifications.notify({
      event: 'warranty_claim_filed',
      recipientUserIds: [assignedStaffId],
      payload: { caseId, warrantyClaimId: claim.id },
    });
  }

  return res.status(201).json({ warrantyClaim: claim });
}

async function listWarrantyClaims(req, res) {
  const caseId = req.params.id;

  const caseRow = await query('SELECT id, practice_id FROM cases WHERE id = $1', [caseId]);
  const caseRecord = caseRow.rows[0];
  if (!caseRecord) {
    return res.status(404).json({ error: 'Case not found.' });
  }
  assertPracticeAccess(req.user, caseRecord.practice_id);

  const { rows } = await query(
    `SELECT id, case_id, filed_by, description, status, resolution_notes, resolved_by, resolved_at, created_at
     FROM warranty_claims WHERE case_id = $1 ORDER BY created_at DESC`,
    [caseId]
  );
  return res.json({ warrantyClaims: rows });
}

const resolveWarrantyClaimSchema = z
  .object({
    status: z.enum(['Under Review', 'Approved', 'Denied', 'Resolved']),
    resolutionNotes: z.string().optional(),
  })
  .strict();

// resolved_at/resolved_by only get set once the claim leaves "Open" AND
// isn't merely "Under Review" (per the migration's own column comment:
// resolved_at is "Null while open/under review").
const RESOLVING_STATUSES = ['Approved', 'Denied', 'Resolved'];

async function resolveWarrantyClaim(req, res) {
  const claimId = req.params.id;
  const input = resolveWarrantyClaimSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const claimRow = await client.query(
      'SELECT id, filed_by, status, resolved_at FROM warranty_claims WHERE id = $1 FOR UPDATE',
      [claimId]
    );
    const claim = claimRow.rows[0];
    if (!claim) {
      const err = new Error('Warranty claim not found.');
      err.status = 404;
      throw err;
    }
    if (claim.resolved_at) {
      const err = new Error(`This warranty claim has already been resolved (status: "${claim.status}").`);
      err.status = 409;
      throw err;
    }

    const setResolved = RESOLVING_STATUSES.includes(input.status);
    const updatedRow = await client.query(
      `UPDATE warranty_claims
       SET status = $1,
           resolution_notes = COALESCE($2, resolution_notes),
           resolved_by = CASE WHEN $3 THEN $4 ELSE resolved_by END,
           resolved_at = CASE WHEN $3 THEN now() ELSE resolved_at END
       WHERE id = $5
       RETURNING id, case_id, filed_by, description, status, resolution_notes, resolved_by, resolved_at, created_at`,
      [input.status, input.resolutionNotes || null, setResolved, req.user.id, claimId]
    );

    return { claim: updatedRow.rows[0], filedBy: claim.filed_by };
  });

  await notifications.notify({
    event: 'warranty_claim_updated',
    recipientUserIds: [result.filedBy],
    payload: { warrantyClaimId: result.claim.id, status: result.claim.status },
  });

  return res.json({ warrantyClaim: result.claim });
}

module.exports = {
  createShipment,
  listShipments,
  updateShipmentStatus,
  createWarrantyClaim,
  listWarrantyClaims,
  resolveWarrantyClaim,
};
