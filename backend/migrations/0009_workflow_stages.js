exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('workflow_stages', {
    id: 'id',
    name: { type: 'varchar(100)', notNull: true },
    sequence_order: { type: 'integer', notNull: true },
    description: { type: 'text' },
  });

  pgm.addConstraint('workflow_stages', 'workflow_stages_unique_order', {
    unique: 'sequence_order',
  });

  // Gap #12 resolution: the docx §11.3 mockup's 7-step tracker is internal sub-stage
  // granularity, seeded here as example data. It does not replace the 10-status
  // case.current_status state machine.
  pgm.sql(`
    INSERT INTO workflow_stages (name, sequence_order, description) VALUES
      ('Submitted', 1, 'Case received from dental office, intake complete.'),
      ('Intake', 2, 'Internal review of case/patient/RX details before production starts.'),
      ('Design', 3, 'Digital or physical design work in progress.'),
      ('Review', 4, 'Design/bisque approval gate with the dental office.'),
      ('Production', 5, 'Manufacturing at the overseas facility.'),
      ('QC', 6, 'Quality control checklist inspection before shipping.'),
      ('Shipping', 7, 'Packaged and handed to courier for delivery.')
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('workflow_stages');
};
