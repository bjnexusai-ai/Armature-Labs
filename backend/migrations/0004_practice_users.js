exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('practice_users', {
    id: { type: 'bigserial', primaryKey: true },
    practice_id: {
      type: 'bigint',
      notNull: true,
      references: 'practices',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    is_primary: { type: 'boolean', notNull: true, default: false },
  });

  pgm.addConstraint('practice_users', 'practice_users_unique_pair', {
    unique: ['practice_id', 'user_id'],
  });
  pgm.createIndex('practice_users', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('practice_users');
};
