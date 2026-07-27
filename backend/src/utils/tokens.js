const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const REFRESH_EXPIRES_SECONDS = 7 * 24 * 60 * 60; // matches 7d default, only used for DB expires_at math

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error(
    'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in the environment before the server starts.'
  );
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'access' },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

// jti is now required — every refresh token is tied to exactly one
// refresh_tokens row, looked up by this id and nothing else (B10).
function signRefreshToken(user, jti) {
  return jwt.sign(
    { sub: user.id, type: 'refresh', jti },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

function newJti() {
  return crypto.randomUUID();
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  newJti,
  REFRESH_EXPIRES_SECONDS,
};
