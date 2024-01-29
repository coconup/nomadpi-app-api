/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('settings', function (table) {
    table.string('setting_key').unique().notNullable();
    table.string('label').notNullable();
    table.text('value');
  })
  .then(() => {
    return knex('settings').insert([
      {
        setting_key: 'portainer_access_token',
        label: 'Portainer access token'
      },
      {
        setting_key: 'gpsd_usb_device',
        label: 'GPS device'
      },
      {
        setting_key: 'zigbee_usb_device',
        label: 'Zigbee device'
      },
      {
        setting_key: 'voice_assistant_enabled',
        label: 'Enable voice assistant',
        value: 'false'
      },
      {
        setting_key: 'voice_assistant_voice_id',
        label: 'Elevenlabs voice ID',
        value: 'JFEEeeDJFfkQ7CFhBTSM'
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
