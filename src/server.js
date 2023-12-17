const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const crypto = require('crypto');

const app = express();
const port = 3000;

// Create a MySQL connection pool
const pool = mysql.createPool({
  host: 'your_database_host',
  user: 'your_database_user',
  password: 'your_database_password',
  database: 'your_database_name',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Encryption key from environment variable
const encryptionKey = process.env.ENCRYPTION_KEY || 'defaultEncryptionKey';

// Middleware to parse JSON requests
app.use(bodyParser.json());

// Function to encrypt data
function encryptData(data) {
  const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
  let encrypted = cipher.update(JSON.stringify(data), 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

// Function to decrypt data
function decryptData(encryptedData) {
  const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return JSON.parse(decrypted);
}

// Generic CRUD function with encryption/decryption option
function createCrudEndpoints(resourceName, tableName, encryptedAttributes = []) {
  // Get all resources
  app.get(`/${resourceName}`, (req, res) => {
    pool.query(`SELECT * FROM ${tableName}`, (err, results) => {
      if (err) throw err;

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
      if (err) throw err;

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
      if (err) throw err;

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
      if (err) throw err;

      res.json(updatedResource);
    });
  });

  // Delete a resource by ID
  app.delete(`/${resourceName}/:id`, (req, res) => {
    const resourceId = parseInt(req.params.id);

    pool.query(`DELETE FROM ${tableName} WHERE id = ?`, resourceId, (err) => {
      if (err) throw err;

      res.json({ message: `${resourceName} deleted successfully` });
    });
  });
}

// Create CRUD endpoints for "switchables" with encryption on the "name" attribute
createCrudEndpoints('switchables', 'switchables', ['name']);

// Create CRUD endpoints for "switchable_groups"
createCrudEndpoints('switchable_groups', 'switchable_groups');

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
