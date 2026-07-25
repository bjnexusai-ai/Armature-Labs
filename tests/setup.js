require('dotenv').config();
const { pool } = require('../src/config/db');

afterAll(async () => {
  await pool.end();
});
