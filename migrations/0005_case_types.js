exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('case_types', {
    id: 'id',
    name: { type: 'varchar(100)', notNull: true, unique: true },
    description: { type: 'text' },
  });

  pgm.sql(`
    INSERT INTO case_types (name) VALUES
      ('Crown'), ('Bridge'), ('Veneer'), ('Denture'),
      ('Implant'), ('Orthodontic Appliance'), ('Custom Restoration')
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('case_types');
};
