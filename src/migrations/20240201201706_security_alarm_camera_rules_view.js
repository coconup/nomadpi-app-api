exports.up = function (knex) {
  return knex.raw(`
    create or replace view security_alarm_camera_rules

    as

    select
      cast(rr.camera_id as int) as camera_id,
      cc.connection_type,
      cast(json_unquote(json_extract(cc.connection_params, '$.camera_id')) as int) as connection_params_camera_id,
      cast(rr.alarm_on as varchar(64)) as alarm_on,
      cast(rr.trigger_on_motion as int) as trigger_on_motion,
      cast(rr.trigger_on_detect as int) as trigger_on_detect
    from settings,
      json_table(
        coalesce(value, '{"rules": []}'),
        '$.rules[*]'
        columns (
          camera_id int path "$.camera_id",
          alarm_on varchar(64) path "$.arm_on",
          trigger_on_motion boolean path "$.trigger_on_motion",
          trigger_on_detect boolean path "$.trigger_on_detect"
        )
      ) rr
      left join cameras cc on cc.id = rr.camera_id
    where setting_key = 'security_alarm_cameras'
  `);
};

exports.down = function (knex) {
  // Drop the view in case of rollback or undoing the migration
  return knex.raw('drop view if exists security_alarm_camera_rules');
};