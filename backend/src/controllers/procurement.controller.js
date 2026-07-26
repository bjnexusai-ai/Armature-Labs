const { z } = require('zod');
const { query, withTransaction } = require('../config/db');
const { recordStockTransaction } = require('./inventory.controller');

// ─────────────────────────────────────────────────────────────────────────
// Vendors
// ─────────────────────────────────────────────────────────────────────────

const createVendorSchema = z
  .object({
    name: z.string().min(1).max(150),
    contactName: z.string().max(150).optional(),
    email: z.string().email().max(150).optional(),
    phone: z.string().max(20).optional(),
    address: z.string().optional(),
  })
  .strict();

async function createVendor(req, res) {
  const input = createVendorSchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO vendors (name, contact_name, email, phone, address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, contact_name, email, phone, address, created_at`,
    [input.name, input.contactName || null, input.email || null, input.phone || null, input.address || null]
  );
  return res.status(201).json({ vendor: rows[0] });
}

async function listVendors(req, res) {
  const { rows } = await query(
    `SELECT id, name, contact_name, email, phone, address, created_at FROM vendors ORDER BY name`
  );
  return res.json({ vendors: rows });
}

// ─────────────────────────────────────────────────────────────────────────
// Purchase orders
// ─────────────────────────────────────────────────────────────────────────

const createPurchaseOrderSchema = z
  .object({
    vendorId: z.coerce.number().int().positive(),
    notes: z.string().optional(),
    items: z
      .array(
        z.object({
          materialId: z.coerce.number().int().positive(),
          quantityOrdered: z.coerce.number().positive(),
          unitCost: z.coerce.number().nonnegative(),
        })
      )
      .min(1, 'At least one item is required.'),
  })
  .strict();

async function createPurchaseOrder(req, res) {
  const input = createPurchaseOrderSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const vendorRow = await client.query('SELECT id FROM vendors WHERE id = $1', [input.vendorId]);
    if (!vendorRow.rows[0]) {
      const err = new Error('vendorId does not reference an existing vendor.');
      err.status = 400;
      throw err;
    }

    const poRow = await client.query(
      `INSERT INTO purchase_orders (vendor_id, status, notes, created_by)
       VALUES ($1, 'Draft', $2, $3)
       RETURNING id, po_number, vendor_id, status, notes, created_by, created_at`,
      [input.vendorId, input.notes || null, req.user.id]
    );
    const po = poRow.rows[0];

    const items = [];
    for (const item of input.items) {
      const materialRow = await client.query('SELECT id FROM materials WHERE id = $1', [item.materialId]);
      if (!materialRow.rows[0]) {
        const err = new Error(`materialId ${item.materialId} does not reference an existing material.`);
        err.status = 400;
        throw err;
      }
      const itemRow = await client.query(
        `INSERT INTO purchase_order_items (purchase_order_id, material_id, quantity_ordered, unit_cost)
         VALUES ($1, $2, $3, $4)
         RETURNING id, material_id, quantity_ordered, unit_cost, quantity_received`,
        [po.id, item.materialId, item.quantityOrdered, item.unitCost.toFixed(2)]
      );
      items.push(itemRow.rows[0]);
    }

    return { ...po, items };
  });

  return res.status(201).json({ purchaseOrder: result });
}

async function listPurchaseOrders(req, res) {
  const vendorFilter = req.query.vendorId ? [req.query.vendorId] : null;
  const { rows } = await query(
    `SELECT id, po_number, vendor_id, status, notes, created_by, created_at, updated_at
     FROM purchase_orders
     WHERE ($1::bigint IS NULL OR vendor_id = $1::bigint)
     ORDER BY created_at DESC`,
    [vendorFilter ? vendorFilter[0] : null]
  );
  return res.json({ purchaseOrders: rows });
}

async function getPurchaseOrder(req, res) {
  const poId = req.params.id;
  const { rows } = await query(
    `SELECT id, po_number, vendor_id, status, notes, created_by, created_at, updated_at
     FROM purchase_orders WHERE id = $1`,
    [poId]
  );
  const po = rows[0];
  if (!po) {
    return res.status(404).json({ error: 'Purchase order not found.' });
  }
  const { rows: items } = await query(
    `SELECT id, material_id, quantity_ordered, unit_cost, quantity_received
     FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY id`,
    [poId]
  );
  return res.json({ purchaseOrder: { ...po, items } });
}

const updatePoStatusSchema = z
  .object({ status: z.enum(['Draft', 'Ordered', 'Cancelled']) })
  .strict();

/**
 * Manual status transitions available to the operator directly:
 * Draft -> Ordered, Ordered -> Cancelled, Draft -> Cancelled. "Partially
 * Received" and "Received" are NOT settable here — those are derived
 * automatically by receivePurchaseOrder below as items actually arrive, so
 * the status can never claim more than what's been physically received.
 */
async function updatePurchaseOrderStatus(req, res) {
  const poId = req.params.id;
  const input = updatePoStatusSchema.parse(req.body);

  const poRow = await query('SELECT id, status FROM purchase_orders WHERE id = $1', [poId]);
  const po = poRow.rows[0];
  if (!po) {
    return res.status(404).json({ error: 'Purchase order not found.' });
  }
  if (['Partially Received', 'Received'].includes(po.status)) {
    return res.status(409).json({ error: `Cannot manually change status once receiving has started (currently ${po.status}).` });
  }

  const { rows } = await query(
    `UPDATE purchase_orders SET status = $1 WHERE id = $2
     RETURNING id, po_number, vendor_id, status, notes, updated_at`,
    [input.status, poId]
  );
  return res.json({ purchaseOrder: rows[0] });
}

// ─────────────────────────────────────────────────────────────────────────
// Receiving — the actual restock event. Creates a Receiving stock
// transaction (via inventory.controller's shared recordStockTransaction,
// so materials.current_stock stays in sync the same way it does for
// Consumption/Adjustment) for each item received, and advances the PO's
// quantity_received + status.
// ─────────────────────────────────────────────────────────────────────────

const receivePurchaseOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          purchaseOrderItemId: z.coerce.number().int().positive(),
          quantityReceived: z.coerce.number().positive(),
          lotNumber: z.string().min(1).max(100),
        })
      )
      .min(1, 'At least one item is required.'),
  })
  .strict();

async function receivePurchaseOrder(req, res) {
  const poId = req.params.id;
  const input = receivePurchaseOrderSchema.parse(req.body);

  const poRow = await query('SELECT id, status FROM purchase_orders WHERE id = $1', [poId]);
  const po = poRow.rows[0];
  if (!po) {
    return res.status(404).json({ error: 'Purchase order not found.' });
  }
  if (['Received', 'Cancelled'].includes(po.status)) {
    return res.status(409).json({ error: `Cannot receive against a ${po.status} purchase order.` });
  }

  // Each item's receiving transaction is its own row-locked operation
  // (inside recordStockTransaction), so items are processed sequentially
  // rather than in one giant transaction — matches this project's existing
  // preference for smaller, independently-consistent writes over a single
  // lock spanning every material touched by a multi-line PO.
  const receivedTransactions = [];
  for (const item of input.items) {
    const itemRow = await query(
      `SELECT id, purchase_order_id, material_id, quantity_ordered, quantity_received
       FROM purchase_order_items WHERE id = $1`,
      [item.purchaseOrderItemId]
    );
    const poItem = itemRow.rows[0];
    if (!poItem || String(poItem.purchase_order_id) !== String(poId)) {
      const err = new Error(`purchaseOrderItemId ${item.purchaseOrderItemId} does not belong to this purchase order.`);
      err.status = 400;
      throw err;
    }
    const remaining = Number(poItem.quantity_ordered) - Number(poItem.quantity_received);
    if (item.quantityReceived > remaining) {
      const err = new Error(
        `Cannot receive ${item.quantityReceived} for item ${item.purchaseOrderItemId} — only ${remaining} remains on order.`
      );
      err.status = 400;
      throw err;
    }

    const { stockTransaction } = await recordStockTransaction({
      materialId: poItem.material_id,
      type: 'Receiving',
      signedQuantity: item.quantityReceived,
      lotNumber: item.lotNumber,
      caseId: null,
      purchaseOrderId: poId,
      performedBy: req.user.id,
      notes: null,
    });
    receivedTransactions.push(stockTransaction);

    await query(
      `UPDATE purchase_order_items SET quantity_received = quantity_received + $1 WHERE id = $2`,
      [item.quantityReceived, poItem.id]
    );
  }

  // Derive the PO's overall status from the actual item totals, not from
  // what the caller says was received — same "don't trust a claim, check
  // the real state" discipline as this project's own status-board
  // corrections.
  const { rows: allItems } = await query(
    `SELECT quantity_ordered, quantity_received FROM purchase_order_items WHERE purchase_order_id = $1`,
    [poId]
  );
  const fullyReceived = allItems.every((i) => Number(i.quantity_received) >= Number(i.quantity_ordered));
  const anyReceived = allItems.some((i) => Number(i.quantity_received) > 0);
  const newStatus = fullyReceived ? 'Received' : anyReceived ? 'Partially Received' : po.status;

  const { rows: updatedPoRows } = await query(
    `UPDATE purchase_orders SET status = $1 WHERE id = $2
     RETURNING id, po_number, vendor_id, status, notes, updated_at`,
    [newStatus, poId]
  );

  return res.status(201).json({ purchaseOrder: updatedPoRows[0], stockTransactions: receivedTransactions });
}

module.exports = {
  createVendor,
  listVendors,
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrderStatus,
  receivePurchaseOrder,
};
