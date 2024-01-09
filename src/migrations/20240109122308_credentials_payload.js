exports.up = function(knex) {
  return knex.schema.alterTable('credentials', (table) => {
    table.json('payload').alter();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('credentials', (table) => {
    table.string('payload').alter();
  });
};