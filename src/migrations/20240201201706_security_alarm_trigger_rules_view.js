exports.up = function (knex) {
  return knex.raw(`
    create or replace view security_alarm_trigger_rules

    as

    select
      cast(rr.trigger_type as varchar(64)) as trigger_type,
      cast(rr.trigger_id as int) as trigger_id,
      cast(json_unquote(json_extract(ss.connection_params, '$.mqtt_topic')) as varchar(65535)) as sensor_mqtt_topic
    from settings,
      json_table(
        coalesce(value, '{"rules": []}'),
        '$.rules[*]'
        columns (
          trigger_type varchar(64) path "$.trigger_type",
          trigger_id int path "$.trigger_id"
        )
      ) rr
      left join sensors ss on(
        rr.trigger_type = 'sensor'
        and ss.id = rr.trigger_id
      )
    where setting_key = 'security_alarm_triggers'
  `);
};

exports.down = function (knex) {
  // Drop the view in case of rollback or undoing the migration
  return knex.raw('drop view if exists security_alarm_trigger_rules');
};