exports.up = function(knex) {
  return knex.schema.table('credentials', function(table) {
    table.dropColumn('payload');
    table.json('payload');
  });
};

exports.down = function(knex) {
  return knex.schema.table('credentials', function(table) {
    table.dropColumn('payload');
    table.string('payload');
  });
};