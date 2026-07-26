const { z } = require('zod');
const { query, withTransaction } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────
// Material categories
// ─────────────────────────────────────────────────────────────────────────

const createCategorySchema = z.object({ name: z.string().min(1).max(150) }).strict();

async function createCategory(req, res) {
  const input = createCategorySchema.parse(req.body);
  const { rows } = await query(
    `INSERT INTO material_categories (name) VALUES ($1) RETURNING id, name, created_at`,
    [input.name]
  );
  return res.status(201).json({ category: rows[0] });
}

async function listCategories(req, res) {
  const { rows } = await query(`SELECT id, name, created_at FROM material_categories ORDER BY name`);
  return res.json({ categories: rows });
}

// ─────────────────────────────────────────────────────────────────────────
// Materials
// ─────────────────────────────────────────────────────────────────────────

const createMaterialSchema = z
  .object({
    categoryId: z.coerce.number().int().positive(),
    name: z.string().min(1).max(150),
    unit: z.string().min(1).max(20),
    unitCost: z.coerce.number().nonnegative().default(0),
    reorderThreshold: z.coerce.number().nonnegative().default(0),
    // Optional starting balance — most materials start at 0 and are built
    // up via Receiving transactions, but this lets an initial physical
    // count be recorded at catalog-creation time without a follow-up call.
    initialStock: z.coerce.number().nonnegative().default(0),
  })
  .strict();

async function createMaterial(req, res) {
  const input = createMaterialSchema.parse(req.body);

  const categoryRow = await query('SELECT id FROM material_categories WHERE id = $1', [input.categoryId]);
  if (!categoryRow.rows[0]) {
    return res.status(400).json({ error: 'categoryId does not reference an existing material category.' });
  }

  const result = await withTransaction(async (client) => {
    const materialRow = await client.query(
      `INSERT INTO materials (category_id, name, unit, unit_cost, reorder_threshold, current_stock)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, category_id, name, unit, unit_cost, reorder_threshold, current_stock, status, created_at`,
      [input.categoryId, input.name, input.unit, input.unitCost.toFixed(2), input.reorderThreshold, input.initialStock]
    );
    const material = materialRow.rows[0];

    if (input.initialStock > 0) {
      await client.query(
        `INSERT INTO material_stock_transactions (material_id, type, quantity, lot_number, performed_by, notes)
         VALUES ($1, 'Adjustment', $2, $3, $4, $5)`,
        [material.id, input.initialStock, 'INITIAL', req.user.id, 'Initial catalog stock count.']
      );
    }

    return material;
  });

  return res.status(201).json({ material: result });
}

const listMaterialsQuerySchema = z
  .object({
    categoryId: z.coerce.number().int().positive().optional(),
    lowStock: z.coerce.boolean().optional(),
  })
  .strict();

async function listMaterials(req, res) {
  const input = listMaterialsQuerySchema.parse(req.query);
  const { rows } = await query(
    `SELECT id, category_id, name, unit, unit_cost, reorder_threshold, current_stock, status, created_at, updated_at
     FROM materials
     WHERE ($1::bigint IS NULL OR category_id = $1::bigint)
       AND ($2::boolean IS NOT TRUE OR current_stock <= reorder_threshold)
     ORDER BY name`,
    [input.categoryId || null, input.lowStock || false]
  );
  return res.json({ materials: rows });
}

async function getMaterial(req, res) {
  const { rows } = await query(
    `SELECT id, category_id, name, unit, unit_cost, reorder_threshold, current_stock, status, created_at, updated_at
     FROM materials WHERE id = $1`,
    [req.params.id]
  );
  const material = rows[0];
  if (!material) {
    return res.status(404).json({ error: 'Material not found.' });
  }
  return res.json({ material });
}

// ─────────────────────────────────────────────────────────────────────────
// Stock transactions
//
// Sign convention enforced here, not left to the caller (see 0028's
// migration header): the operator supplies a positive "how much", and this
// controller decides the stored sign based on `type`. Adjustment is the one
// exception — its whole purpose is a manual correction that can go either
// way, so the signed value is taken as given.
// ─────────────────────────────────────────────────────────────────────────

const consumeMaterialSchema = z
  .object({
    quantity: z.coerce.number().positive(),
    lotNumber: z.string().min(1).max(100),
    caseId: z.coerce.number().int().positive().optional(),
    notes: z.string().optional(),
  })
  .strict();

async function consumeMaterial(req, res) {
  const materialId = req.params.id;
  const input = consumeMaterialSchema.parse(req.body);

  if (input.caseId) {
    const caseRow = await query('SELECT id FROM cases WHERE id = $1', [input.caseId]);
    if (!caseRow.rows[0]) {
      return res.status(400).json({ error: 'caseId does not reference an existing case.' });
    }
  }

  const result = await recordStockTransaction({
    materialId,
    type: 'Consumption',
    signedQuantity: -Math.abs(input.quantity),
    lotNumber: input.lotNumber,
    caseId: input.caseId || null,
    purchaseOrderId: null,
    performedBy: req.user.id,
    notes: input.notes || null,
  });

  return res.status(201).json(result);
}

const adjustMaterialSchema = z
  .object({
    quantity: z.coerce.number().refine((v) => v !== 0, 'quantity must not be zero.'),
    lotNumber: z.string().min(1).max(100),
    notes: z.string().min(1, 'A reason is required for a manual stock adjustment.'),
  })
  .strict();

async function adjustMaterial(req, res) {
  const materialId = req.params.id;
  const input = adjustMaterialSchema.parse(req.body);

  const result = await recordStockTransaction({
    materialId,
    type: 'Adjustment',
    signedQuantity: input.quantity,
    lotNumber: input.lotNumber,
    caseId: null,
    purchaseOrderId: null,
    performedBy: req.user.id,
    notes: input.notes,
  });

  return res.status(201).json(result);
}

async function listStockTransactions(req, res) {
  const materialId = req.params.id;
  const { rows } = await query(
    `SELECT id, material_id, type, quantity, lot_number, case_id, purchase_order_id, performed_by, notes, created_at
     FROM material_stock_transactions WHERE material_id = $1 ORDER BY created_at DESC`,
    [materialId]
  );
  return res.json({ stockTransactions: rows });
}

/**
 * Shared core for every write to material_stock_transactions — receiving
 * (procurement.controller.js), consumption, and adjustment all funnel
 * through this so `materials.current_stock` can never drift from the sum
 * of its transaction rows. Row-locks the material (FOR UPDATE) so two
 * concurrent movements against the same material can't both read a stale
 * balance, same discipline as billing.controller.js's recordPayment.
 */
async function recordStockTransaction({
  materialId,
  type,
  signedQuantity,
  lotNumber,
  caseId,
  purchaseOrderId,
  performedBy,
  notes,
}) {
  return withTransaction(async (client) => {
    const materialRow = await client.query(
      `SELECT id, current_stock FROM materials WHERE id = $1 FOR UPDATE`,
      [materialId]
    );
    const material = materialRow.rows[0];
    if (!material) {
      const err = new Error('Material not found.');
      err.status = 404;
      throw err;
    }

    const newStock = Number(material.current_stock) + signedQuantity;
    if (newStock < 0) {
      const err = new Error('This transaction would take current_stock negative.');
      err.status = 409;
      throw err;
    }

    const txnRow = await client.query(
      `INSERT INTO material_stock_transactions
         (material_id, type, quantity, lot_number, case_id, purchase_order_id, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, material_id, type, quantity, lot_number, case_id, purchase_order_id, performed_by, notes, created_at`,
      [materialId, type, signedQuantity, lotNumber, caseId, purchaseOrderId, performedBy, notes]
    );

    const updatedMaterialRow = await client.query(
      `UPDATE materials SET current_stock = $1 WHERE id = $2
       RETURNING id, category_id, name, unit, unit_cost, reorder_threshold, current_stock, status, updated_at`,
      [newStock, materialId]
    );

    return { stockTransaction: txnRow.rows[0], material: updatedMaterialRow.rows[0] };
  });
}

module.exports = {
  createCategory,
  listCategories,
  createMaterial,
  listMaterials,
  getMaterial,
  consumeMaterial,
  adjustMaterial,
  listStockTransactions,
  recordStockTransaction,
};
