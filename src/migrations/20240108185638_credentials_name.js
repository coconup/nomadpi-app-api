exports.up = function(knex) {
  return knex.schema.table('credentials', function(table) {
    table.string('name');
  });
};

exports.down = function(knex) {
  return knex.schema.table('credentials', function(table) {
    table.dropColumn('name');
  });
};