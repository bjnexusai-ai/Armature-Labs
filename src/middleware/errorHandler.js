const { ZodError } = require('zod');

/**
 * Must be registered LAST, after all routes. Relies on express-async-errors
 * (imported once in app.js) so async route/controller throws land here
 * automatically instead of crashing the process.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed.',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  // Postgres unique_violation
  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with that value already exists.' });
  }

  // Postgres foreign_key_violation
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist.' });
  }

  // Postgres check_violation / invalid enum input
  if (err.code === '22P02' || err.code === '23514') {
    return res.status(400).json({ error: 'Invalid value supplied.' });
  }

  const status = err.status || 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  return res.status(status).json({
    error: status >= 500 ? 'Internal server error.' : err.message || 'Request failed.',
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFoundHandler };
