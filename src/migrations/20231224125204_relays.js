/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('relays', function (table) {
    table.increments('id').primary();
    table.string('name').unique().notNullable();
    table.string('relay_position').unique().notNullable();
    table.string('icon');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('relays');
};
