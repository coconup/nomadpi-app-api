/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex('settings').insert([
    {
      setting_key: 'microphone_usb_device',
      label: 'Microphone (USB)'
    }
  ]);
};