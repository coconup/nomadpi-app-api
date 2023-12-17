/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('switchables', function (table) {
    table.increments('switchable_id').primary();
    table.string('name').notNullable();
    table.boolean('enabled').notNullable();
    table.string('icon');
    table.string('target_type').notNullable();
    table.string('target_id').notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('switchables');
};