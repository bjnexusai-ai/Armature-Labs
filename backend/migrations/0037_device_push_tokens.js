// M5 (mobile): closes the device_push_tokens gap flagged since M2/M3 —
// confirmed still absent on `main` as of this session (grepped
// backend/migrations + backend/src/routes before writing this). Mobile's
// src/lib/push.ts has had a documented no-op (submitDevicePushToken)
// since M3 waiting on this table; this is the last mobile session before
// store submission, so it's closed now rather than carried forward again.
//
// One row per (user, token): a user can have multiple devices (phone +
// tablet), and the same physical device's Expo push token can churn
// (reinstall, OS update) — upsert on token, not on user, so a stale token
// row is naturally replaced rather than accumulating duplicates tied to
// the same underlying device.
exports.up = (pgm) => {
  pgm.createTable('device_push_tokens', {
    id: { type: 'bigserial', primaryKey: true },
    user_id: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    expo_push_token: { type: 'varchar(255)', notNull: true, unique: true },
    platform: { type: 'varchar(10)', notNull: true }, // 'ios' | 'android'
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('device_push_tokens', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('device_push_tokens');
};
