exports.up = function(knex) {
  return knex.schema.alterTable('credentials', (table) => {
    table.text('payload', 'longtext').alter();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('credentials', (table) => {
    table.string('payload').alter();
  });
};