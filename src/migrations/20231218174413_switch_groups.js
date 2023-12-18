/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('switch_groups', function (table) {
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
  return knex.schema.dropTable('switch_groups');
};
