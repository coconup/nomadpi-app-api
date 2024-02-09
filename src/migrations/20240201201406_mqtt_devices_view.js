exports.up = function (knex) {
  return knex.raw(`
    create or replace view mqtt_devices

    as

    select
      'sensor' as device_type,
      sensor_type as device_subtype,
      id as device_id,
      json_unquote(json_extract(connection_params, '$.mqtt_topic')) as mqtt_topic
    from sensors
    where connection_type = 'mqtt'

    union all

    select
      'water_tank' as device_type,
      null as device_subtype,
      id as device_id,
      json_unquote(json_extract(connection_params, '$.mqtt_topic')) as mqtt_topic
    from water_tanks
    where connection_type = 'mqtt'

    union all

    select
      'camera' as device_type,
      null as device_subtype,
      id as device_id,
      concat(
        'frigate/',
        json_unquote(json_extract(connection_params, '$.camera_id')),
        '/motion'
      ) as mqtt_topic
    from cameras
    where connection_type = 'frigate'
  `);
};

exports.down = function (knex) {
  // Drop the view in case of rollback or undoing the migration
  return knex.raw('drop view if exists mqtt_devices');
};