/**
 * Validates req.body against a zod schema, replacing it with the parsed
 * (type-coerced, defaulted) result. Throws ZodError on failure, which
 * errorHandler.js turns into a clean 400 response.
 */
function validateBody(schema) {
  return (req, res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}

module.exports = { validateBody };
