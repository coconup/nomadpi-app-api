const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const knex = require('knex');

const app = express();
const port = 3000;

if(process.env.VANPI_APP_API_ENABLE_AUTHENTICATION === undefined) throw `\`$VANPI_APP_API_ENABLE_AUTHENTICATION\` is not set`;
if(!process.env.ENCRYPTION_KEY) throw `\`$ENCRYPTION_KEY\` is not set`;
if(!process.env.VANPI_APP_API_ALLOWED_DOMAINS) throw `\`$VANPI_APP_API_ALLOWED_DOMAINS\` is not set`;

// Set constants

const [
  encryptionKey,
  corsWhitelist
] = [
  process.env.ENCRYPTION_KEY,
  process.env.VANPI_APP_API_ALLOWED_DOMAINS
];

const enableAuthentication = (/true/).test(process.env.VANPI_APP_API_ENABLE_AUTHENTICATION);

// Fetch database credentials from environment variables
const databaseConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

if(Object.values(databaseConfig).find(v => !v)) {
  throw `One or more of the database variables are not set: ${Object.keys(databaseConfig).map(k => `\`$${k}\``).join(', ')}`;
};

// Add headers before the routes are defined
app.use(function (req, res, next) {
  const parsedCorsWhitelist = (corsWhitelist || '').split(',').filter(s => !!s).map(s => s.trim());

  if (parsedCorsWhitelist.includes(req.headers.origin)) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type,Accept');
  res.setHeader('Access-Control-Allow-Credentials', enableAuthentication);
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

  // Middleware to parse JSON requests
  app.use(bodyParser.json());

  // Use express-session middleware
  app.use(
    session({
      secret: encryptionKey,
      resave: false,
      saveUninitialized: true,
      cookie: { 
        // domain: 'localhost'
        // sameSite: 'none'
        // secure: true 
      }
    })
  );

  // Function to encrypt data
  function encryptData(data) {
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  // Function to decrypt data
  function decryptData(encryptedData) {
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
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

  // Authentication middleware
  const authenticateUser = (req, res, next) => {
    if (!enableAuthentication || req.session.user) {
      next();
    } else {
      const { username, password } = req.body;

      // Find the user by username in the database
      pool
        .query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
          if(err) {
            console.error(err);
            res.status(500).json({ error: 'Internal Server Error' });
          }

          const user = results[0];

          // Check if the user exists and verify the password
          if (user && bcrypt.compareSync(password, user.password)) {
            req.session.user = user; // Save user data in the session
            next();
          } else {
            res.status(401).json({ error: 'Unauthorized' });
          }
        });
    }
  };

  // Auth routes
  app.get('/auth/status', authenticateUser, (req, res) => {
    if(enableAuthentication) {
      res.json({ message: 'ok' });  
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  app.post('/auth/login', authenticateUser, (req, res) => {
    if(enableAuthentication) {
      res.json({ message: 'ok' });  
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // Generic CRUD function with encryption/decryption option
  function createCrudEndpoints(resourceName, tableName, encryptedAttributes = []) {
    // Get all resources
    app.get(`/${resourceName}`, authenticateUser, (req, res) => {
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
    app.get(`/${resourceName}/:id`, authenticateUser, (req, res) => {
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
    app.post(`/${resourceName}`, authenticateUser, (req, res) => {
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
    app.put(`/${resourceName}/:id`, authenticateUser, (req, res) => {
      const resourceId = parseInt(req.params.id);
      const updatedResource = req.body;

      pool.query(`UPDATE ${tableName} SET ? WHERE id = ?`, [updatedResource, resourceId], (err) => {
        if (err) return handleError(err, res);

        res.json(updatedResource);
      });
    });

    // Delete a resource by ID
    app.delete(`/${resourceName}/:id`, authenticateUser, (req, res) => {
      const resourceId = parseInt(req.params.id);

      pool.query(`DELETE FROM ${tableName} WHERE id = ?`, resourceId, (err) => {
        if (err) return handleError(err, res);

        res.json({ message: `${resourceName} deleted successfully` });
      });
    });
  }

  // Create CRUD endpoints for "credentials" with encryption on the "payload" attribute
  createCrudEndpoints('credentials', 'credentials', ['payload']);

  // Create CRUD endpoints
  createCrudEndpoints('relay_switches', 'relay_switches', []);
  createCrudEndpoints('action_switches', 'action_switches', []);
  createCrudEndpoints('switch_groups', 'switch_groups', []);

  // Start the server
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
});
