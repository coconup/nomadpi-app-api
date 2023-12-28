/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.raw(`
    create view usb_devices

    as

    select
      'gpsd_usb' as device_key,
      value as device_spec
    from settings
    where setting_key = 'gpsd_usb_device'

    union all

    select
      'foo' as device_key,
      value as device_spec
    from settings
    where setting_key = 'foo'
  `)
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropView('usb_devices');
};
