const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const knex = require('knex');

const app = express();
const port = 3000;

// Fetch database credentials from environment variables
const databaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'your_database_name',
};

// Add headers before the routes are defined
app.use(function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  // res.setHeader('Access-Control-Allow-Credentials', true);
  next();
});

// Create a MySQL connection pool
const pool = mysql.createPool(databaseConfig);

// Migration configuration
const knexConfig = require('./knexfile');
const knexInstance = knex(knexConfig.development);

// Run migrations
knexInstance.migrate.latest().then(() => {
  console.log('Migrations ran successfully.');

  // Encryption key from environment variable
  const encryptionKey = process.env.ENCRYPTION_KEY || 'defaultEncryptionKey';

  // Middleware to parse JSON requests
  app.use(bodyParser.json());

  // Function to encrypt data
  function encryptData(data) {
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  // Function to decrypt data
  function decryptData(encryptedData) {
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
    const [ivHex, encryptedText] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return JSON.parse(decrypted);
  }

  function handleError(error, res) {
    console.log(JSON.stringify(error))
    return res.status(400).json({message: error.sqlMessage});
  }

  // Generic CRUD function with encryption/decryption option
  function createCrudEndpoints(resourceName, tableName, encryptedAttributes = []) {
    // Get all resources
    app.get(`/${resourceName}`, (req, res) => {
      pool.query(`SELECT * FROM ${tableName}`, (err, results) => {
        if (err) return handleError(err, res);

        const decryptedResults = results.map(result => {
          if (encryptedAttributes.length > 0) {
            encryptedAttributes.forEach(attr => {
              result[attr] = decryptData(result[attr]);
            });
          }
          return result;
        });

        res.json(decryptedResults);
      });
    });

    // Get a specific resource by ID
    app.get(`/${resourceName}/:id`, (req, res) => {
      const resourceId = parseInt(req.params.id);

      pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [resourceId], (err, results) => {
        if (err) return handleError(err, res);

        if (results.length === 0) {
          return res.status(404).json({ error: `${resourceName} not found` });
        }

        const decryptedResult = results[0];

        if (encryptedAttributes.length > 0) {
          encryptedAttributes.forEach(attr => {
            decryptedResult[attr] = decryptData(decryptedResult[attr]);
          });
        }

        res.json(decryptedResult);
      });
    });

    // Create a new resource
    app.post(`/${resourceName}`, (req, res) => {
      const newResource = req.body;

      // Encrypt specified attributes
      if (encryptedAttributes.length > 0) {
        encryptedAttributes.forEach(attr => {
          newResource[attr] = encryptData(newResource[attr]);
        });
      }

      pool.query(`INSERT INTO ${tableName} SET ?`, newResource, (err, results) => {
        if (err) return handleError(err, res);

        newResource.id = results.insertId;

        // Return the decrypted result
        const decryptedResult = { ...newResource };
        if (encryptedAttributes.length > 0) {
          encryptedAttributes.forEach(attr => {
            decryptedResult[attr] = decryptData(decryptedResult[attr]);
          });
        }

        res.status(201).json(decryptedResult);
      });
    });

    // Update a resource by ID
    app.put(`/${resourceName}/:id`, (req, res) => {
      const resourceId = parseInt(req.params.id);
      const updatedResource = req.body;

      pool.query(`UPDATE ${tableName} SET ? WHERE id = ?`, [updatedResource, resourceId], (err) => {
        if (err) return handleError(err, res);

        res.json(updatedResource);
      });
    });

    // Delete a resource by ID
    app.delete(`/${resourceName}/:id`, (req, res) => {
      const resourceId = parseInt(req.params.id);

      pool.query(`DELETE FROM ${tableName} WHERE id = ?`, resourceId, (err) => {
        if (err) return handleError(err, res);

        res.json({ message: `${resourceName} deleted successfully` });
      });
    });
  }

  // Create CRUD endpoints for "switchables"
  createCrudEndpoints('relay_switches', 'relay_switches', []);

  // Create CRUD endpoints for "credentials" with encryption on the "payload" attribute
  createCrudEndpoints('credentials', 'credentials', ['payload']);

  // Start the server
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
});
