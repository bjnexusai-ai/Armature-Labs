exports.up = (pgm) => {
  pgm.createTable('refresh_tokens', {
    id: { type: 'bigserial', primaryKey: true },
    user_id: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    jti: { type: 'uuid', notNull: true, unique: true },
    revoked_at: { type: 'timestamptz', notNull: false },
    revoked_reason: { type: 'varchar(30)', notNull: false }, // 'rotated' | 'logout' | 'logout_all' | 'reuse_detected'
    replaced_by_jti: { type: 'uuid', notNull: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
  });

  pgm.createIndex('refresh_tokens', 'jti');
  pgm.createIndex('refresh_tokens', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('refresh_tokens');
};
