require('dotenv').config();
require('express-async-errors'); // must load before routes are required

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const practicesRoutes = require('./routes/practices.routes');
const patientsRoutes = require('./routes/patients.routes');
const casesRoutes = require('./routes/cases.routes');
const approvalsRoutes = require('./routes/approvals.routes');
const referenceRoutes = require('./routes/reference.routes');
const billingRoutes = require('./routes/billing.routes');
const qcRoutes = require('./routes/qc.routes');
const fulfillmentRoutes = require('./routes/fulfillment.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const procurementRoutes = require('./routes/procurement.routes');
const reportsRoutes = require('./routes/reports.routes');
const equipmentRoutes = require('./routes/equipment.routes');
const planningRoutes = require('./routes/planning.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/practices', practicesRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/approvals', approvalsRoutes);
app.use('/api/reference', referenceRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/qc', qcRoutes);
app.use('/api/fulfillment', fulfillmentRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/planning', planningRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
