/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('settings', function (table) {
    table.string('setting_key').unique().notNullable();
    table.string('label').notNullable();
    table.string('type');
    table.text('value');
  })
  .then(() => {
    return knex('settings').insert([
      {
        setting_key: 'portainer_access_token',
        label: 'Portainer access token',
        type: 'string'
      },
      {
        setting_key: 'gpsd_usb_device',
        label: 'GPS device',
        type: 'json'
      },
      {
        setting_key: 'zigbee_usb_device',
        label: 'Zigbee device',
        type: 'json'
      },
      {
        setting_key: 'voice_assistant_enabled',
        label: 'Enable voice assistant',
        value: 'false',
        type: 'boolean'
      },
      {
        setting_key: 'voice_assistant_voice_id',
        label: 'Elevenlabs voice ID',
        value: 'JFEEeeDJFfkQ7CFhBTSM',
        type: 'string'
      },
      {
        setting_key: 'security_alarm_enabled',
        label: 'Enable security alarm',
        type: 'boolean'
      },
      {
        setting_key: 'security_alarm_cameras',
        label: 'Security cameras',
        type: 'json'
      },
      {
        setting_key: 'security_alarm_triggers',
        label: 'Alarm triggers',
        type: 'json'
      },
      {
        setting_key: 'security_alarm_notifications',
        label: 'Alarm notifications',
        type: 'json'
      },
      {
        setting_key: 'notifications_whatsapp_number',
        label: 'WhatsApp number',
        type: 'string'
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
