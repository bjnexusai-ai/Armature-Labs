exports.shorthands = undefined;

// Session 5.5 gap closure — backfills cases.patient_id from the legacy
// cases.patient_name column, per 0023_patients.js's own transitional note.
// patient_name / patient_reference_id are intentionally left in place as a
// display cache (that migration's decision, not revisited here) — only
// patient_id is populated.
//
// Splitting rule: first_name = first whitespace-delimited token in
// patient_name; last_name = the trimmed remainder, or '' (empty string,
// which satisfies the NOT NULL constraint) if patient_name has no space.
// Distinct (practice_id, first_name, last_name) combos get exactly one new
// patients row — cases sharing an identical patient_name within the same
// practice are linked to the same patient, not duplicated.
//
// Cases with patient_name IS NULL are left with patient_id NULL — there is
// nothing to backfill from, and this migration does not invent placeholder
// patient records for them.
exports.up = (pgm) => {
  pgm.sql(`
    WITH ins AS (
      INSERT INTO patients (practice_id, first_name, last_name)
      SELECT DISTINCT
        c.practice_id,
        split_part(c.patient_name, ' ', 1) AS first_name,
        CASE WHEN strpos(c.patient_name, ' ') > 0
             THEN trim(substring(c.patient_name FROM strpos(c.patient_name, ' ') + 1))
             ELSE '' END AS last_name
      FROM cases c
      WHERE c.patient_name IS NOT NULL AND c.patient_id IS NULL
      RETURNING id, practice_id, first_name, last_name
    )
    UPDATE cases c
    SET patient_id = ins.id
    FROM ins
    WHERE c.patient_id IS NULL
      AND c.patient_name IS NOT NULL
      AND c.practice_id = ins.practice_id
      AND split_part(c.patient_name, ' ', 1) = ins.first_name
      AND (
        CASE WHEN strpos(c.patient_name, ' ') > 0
             THEN trim(substring(c.patient_name FROM strpos(c.patient_name, ' ') + 1))
             ELSE '' END
      ) = ins.last_name;
  `);
};

exports.down = (pgm) => {
  // Intentionally a no-op. Reversing this would mean deleting patients rows
  // and nulling cases.patient_id, but by the time this migration is ever
  // rolled back, application code (and possibly frontend state) may already
  // depend on that data. Data backfills are treated as one-way here, same
  // as the seed script's own upsert pattern never un-seeds.
  pgm.sql('-- no-op: see comment in exports.up');
};
