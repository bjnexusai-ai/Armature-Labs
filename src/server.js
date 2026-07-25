const app = require('./app');

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Dental Lab CRM backend listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

module.exports = server;
