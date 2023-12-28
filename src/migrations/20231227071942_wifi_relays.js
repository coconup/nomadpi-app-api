/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('wifi_relays', function (table) {
    table.increments('id').primary();
    table.string('name').unique().notNullable();
    table.string('icon');
    table.string('vendor_id').notNullable();
    table.string('mqtt_topic').notNullable();
    table.string('relay_position');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('wifi_relays');
};
