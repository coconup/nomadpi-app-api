/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('modes', function (table) {
    table.increments('id').primary();
    table.string('name').unique().notNullable();
    table.string('key').unique().notNullable();
    table.string('icon');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('modes');
};
