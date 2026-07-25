exports.up = (pgm) => {
  pgm.addColumns('invoices', {
    due_date: { type: 'date' },
    tax_amount: { type: 'numeric(10,2)' },
    paid_date: { type: 'date' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('invoices', ['due_date', 'tax_amount', 'paid_date']);
};
