/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('action_switches', function (table) {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('icon');
    table.json('switches').notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('action_switches');
};
