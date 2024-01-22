/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('heaters', function (table) {
    table.increments('id').primary();
    table.string('name').unique().notNullable();
    table.string('vendor_id').notNullable();
    table.string('product_id').notNullable();
    table.string('connection_type').notNullable();
    table.json('connection_params').notNullable();
    table.json('heater_settings').notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('heaters');
};
