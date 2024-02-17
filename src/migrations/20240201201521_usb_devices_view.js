exports.up = function (knex) {
  return knex.raw(`
    create or replace view usb_devices

    as

    select
      '${process.env.GPSD_UDEV_KEY}' as device_key,
      value as device_spec
    from settings
    where setting_key = 'gpsd_usb_device'

    union all

    select
      '${process.env.ZIGBEE_UDEV_KEY}' as device_key,
      value as device_spec
    from settings
    where setting_key = 'zigbee_usb_device'

    union all

    select
      concat('vanpi-heater-', vendor_id, '-usb') as device_key,
      connection_params as device_spec
    from heaters
    where device_type = 'usb'
  `);
};

exports.down = function (knex) {
  // Drop the view in case of rollback or undoing the migration
  return knex.raw('drop view if exists usb_devices');
};