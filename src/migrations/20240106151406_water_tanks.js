/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('water_tanks', function (table) {
    table.increments('id').primary();
    table.string('name').unique().notNullable();
    table.string('connection_type').notNullable();
    table.json('connection_params').notNullable();
    table.string('volumetric_type').notNullable();
    table.json('volumetric_params').notNullable();
    table.json('water_tank_settings').notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('water_tanks');
};
