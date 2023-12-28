/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('settings', function (table) {
    table.string('setting_key').primary().notNullable();
    table.string('label').primary().notNullable();
    table.string('value').notNullable();
  })
  .then(() => {
    // Insert the initial user with hashed password
    knex('settings').insert([
      {
        setting_key: 'gpsd_usb_device',
        label: 'GPS device'
      },
    ]);
  });;
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('settings');
};
