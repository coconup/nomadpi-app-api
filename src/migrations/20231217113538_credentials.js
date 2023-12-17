/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('credentials', function (table) {
    table.increments('credential_id').primary();
    table.string('service_id').notNullable();
    table.string('payload');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('credentials');
};