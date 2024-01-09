/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('sensors', function (table) {
    table.increments('id').primary();
    table.string('name').unique().notNullable();
    table.string('sensor_type').notNullable();
    table.string('connection_type').notNullable();
    table.json('connection_params').notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('sensors');
};
