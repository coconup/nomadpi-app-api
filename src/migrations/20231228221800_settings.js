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
    return knex('settings').insert([
      {
        setting_key: 'gpsd_usb_device',
        label: 'GPS device'
      },
      {
        setting_key: 'zigbee_usb_device',
        label: 'Zigbee device'
      }
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
