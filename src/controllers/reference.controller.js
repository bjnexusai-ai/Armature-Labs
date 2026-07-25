const { query } = require('../config/db');

async function listRoles(req, res) {
  const { rows } = await query('SELECT id, name, description FROM roles ORDER BY id');
  return res.json({ roles: rows });
}

async function listCaseTypes(req, res) {
  const { rows } = await query('SELECT id, name, description FROM case_types ORDER BY id');
  return res.json({ caseTypes: rows });
}

async function listWorkflowStages(req, res) {
  const { rows } = await query(
    'SELECT id, name, sequence_order, description FROM workflow_stages ORDER BY sequence_order'
  );
  return res.json({ workflowStages: rows });
}

module.exports = { listRoles, listCaseTypes, listWorkflowStages };
