const { z } = require('zod');
const { query } = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────
// Device push tokens — POST /api/device-push-tokens, DELETE /api/device-push-tokens
//
// Scope, deliberately narrow (M5 mobile session): this registers/removes an
// Expo push token against the signed-in user. It does NOT wire up the send
// side — `services/notifications.js#notify()` is still fully stubbed (no
// email/SMS/push provider configured, confirmed in M3), so a token stored
// here has nothing reading it yet. Closing that gap is a separate session,
// not part of "close the device_push_tokens table" per the M5 brief.
//
// No portal-permission gate (unlike invoices/approvals) — any authenticated
// user, staff or dentist_client, can register a device for their own
// account. There's no case/practice-scoped data here to tenant-isolate.
// ─────────────────────────────────────────────────────────────────────────

const registerTokenSchema = z
  .object({
    expoPushToken: z.string().min(1),
    platform: z.enum(['ios', 'android']),
  })
  .strict();

const removeTokenSchema = z
  .object({
    expoPushToken: z.string().min(1),
  })
  .strict();

async function registerDevicePushToken(req, res) {
  const input = registerTokenSchema.parse(req.body);

  // Upsert on the token itself, not (user_id, token) — see migration
  // comment: if this exact token was previously registered by a different
  // user on the same shared/reset device, ownership moves to whoever is
  // signed in now. last_seen_at is bumped on every call so a background
  // re-registration (app foreground, token unchanged) doesn't create a
  // duplicate row.
  const { rows } = await query(
    `INSERT INTO device_push_tokens (user_id, expo_push_token, platform, created_at, last_seen_at)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (expo_push_token)
     DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()
     RETURNING id, user_id, expo_push_token, platform, created_at, last_seen_at`,
    [req.user.id, input.expoPushToken, input.platform]
  );

  return res.status(201).json({ devicePushToken: rows[0] });
}

// Called on sign-out so a shared/lost device stops receiving push after the
// user signs out of it — mirrors the reasoning behind logout-all's
// refresh-token revocation (B10), applied to push instead of auth tokens.
async function removeDevicePushToken(req, res) {
  const input = removeTokenSchema.parse(req.body);

  await query(
    `DELETE FROM device_push_tokens WHERE expo_push_token = $1 AND user_id = $2`,
    [input.expoPushToken, req.user.id]
  );

  return res.status(204).send();
}

module.exports = { registerDevicePushToken, removeDevicePushToken };
