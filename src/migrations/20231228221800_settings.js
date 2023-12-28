/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('settings', function (table) {
    table.string('setting_key').unique().notNullable();
    table.string('label').notNullable();
    table.string('value');
  })
  .then(() => {
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
