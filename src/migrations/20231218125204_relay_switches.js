/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('relay_switches', function (table) {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('target_type').notNullable();
    table.string('target_id').notNullable();
    table.string('icon');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('relay_switches');
};
