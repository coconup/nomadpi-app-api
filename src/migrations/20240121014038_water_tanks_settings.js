exports.up = function(knex) {
  return knex.schema.table('water_tanks', function(table) {
    table.json('water_tank_settings');
  });
};

exports.down = function(knex) {
  return knex.schema.table('water_tanks', function(table) {
    table.dropColumn('water_tank_settings');
  });
};