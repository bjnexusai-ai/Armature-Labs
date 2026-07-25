exports.shorthands = undefined;

// Session 5 — messaging/notes §5. Case-scoped notes, not practice-level —
// every note is tied to a specific case since that's where the client's own
// workflow discussion happens (a practice-level note has no obvious owner
// or lifecycle; if a later session needs practice-wide notes, that's a
// separate table, not an overload of this one).
//
// DECISION (documented per this project's standing convention): visibility
// is a two-value enum ('internal', 'portal') rather than a boolean, so it
// reads the same way media_stage and other client-facing enums already do
// in this schema. 'internal' notes are staff-only; 'portal' notes are
// visible to a dentist_client on that case's practice too. Default is
// 'internal' — a note only becomes portal-visible by explicit choice at
// creation, never by omission.
exports.up = (pgm) => {
  pgm.createType('note_visibility', ['internal', 'portal']);

  pgm.createTable('case_notes', {
    id: { type: 'bigserial', primaryKey: true },
    case_id: {
      type: 'bigint',
      notNull: true,
      references: 'cases',
      onDelete: 'CASCADE',
    },
    author_id: {
      type: 'bigint',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    body: { type: 'text', notNull: true },
    visibility: { type: 'note_visibility', notNull: true, default: 'internal' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('case_notes', 'case_id');
  pgm.createIndex('case_notes', 'visibility');
};

exports.down = (pgm) => {
  pgm.dropTable('case_notes');
  pgm.dropType('note_visibility');
};
