const bcrypt = require('bcrypt');

// Retrieve username and password from environment variables
const enableAuthentication = (/true/).test(process.env.VANPI_APP_API_ENABLE_AUTHENTICATION);
const username = process.env.VANPI_APP_API_USERNAME;
const password = process.env.VANPI_APP_API_PASSWORD;

if(enableAuthentication && (!username || !password)) {
  throw `\`$VANPI_APP_API_USERNAME\` and/or \`$VANPI_APP_API_PASSWORD\` are not defined`;
}

exports.up = function (knex) {
  return knex.schema.createTable('users', function (table) {
    table.increments('id').primary();
    table.string('username').notNullable();
    table.string('password').notNullable();
  })
  .then(() => {
    // Insert the initial user with hashed password
    if(username && password) {
      const hashedPassword = bcrypt.hashSync(password, 10); // Hashed password
      return knex('users').insert([
        {
          username,
          password: hashedPassword,
        },
      ]);
    }
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('users');
};
