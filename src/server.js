const express = require('express');
const expressWs = require('express-ws');
const WebSocket = require('ws');
const axios = require('axios');
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const knex = require('knex');

const app = express();
const port = 3001;

expressWs(app);

if(process.env.VANPI_APP_API_ENABLE_AUTHENTICATION === undefined) throw `\`$VANPI_APP_API_ENABLE_AUTHENTICATION\` is not set`;
if(!process.env.ENCRYPTION_KEY) throw `\`$ENCRYPTION_KEY\` is not set`;
if(!process.env.VANPI_APP_API_ALLOWED_DOMAINS) throw `\`$VANPI_APP_API_ALLOWED_DOMAINS\` is not set`;
if(!process.env.VANPI_API_ROOT_URL) throw `\`$VANPI_API_ROOT_URL\` is not set`;
if(!process.env.AUTOMATION_API_ROOT_URL) throw `\`$AUTOMATION_API_ROOT_URL\` is not set`;
// if(!process.env.BUTTERFLY_API_ROOT_URL) throw `\`$BUTTERFLY_API_ROOT_URL\` is not set`;
// if(!process.env.SERVICES_API_ROOT_URL) throw `\`$SERVICES_API_ROOT_URL\` is not set`;
// if(!process.env.FRIGATE_API_ROOT_URL) throw `\`$FRIGATE_API_ROOT_URL\` is not set`;

// Set constants

const [
  encryptionKey,
  corsWhitelist,
  vanPiApiRootUrl,
  automationApiRootUrl,
  butterflyApiRootUrl,
  servicesApiRootUrl,
  frigateApiRootUrl
] = [
  process.env.ENCRYPTION_KEY,
  process.env.VANPI_APP_API_ALLOWED_DOMAINS,
  process.env.VANPI_API_ROOT_URL,
  process.env.AUTOMATION_API_ROOT_URL,
  process.env.BUTTERFLY_API_ROOT_URL,
  process.env.SERVICES_API_ROOT_URL,
  process.env.FRIGATE_API_ROOT_URL
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
  } else {
    console.log(`Rejected request from origin \`${req.headers.origin}\``)
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type,Accept');
  res.setHeader('Access-Control-Allow-Credentials', true);

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

  // Open wake word internal websocket forwarding
  app.ws('/ws/open_wake_word', (ws, req) => {
    const owwWebSocket = new WebSocket('ws://localhost:9002/ws');

    ws.on('message', (message) => {
      owwWebSocket.send(message);
    });

    owwWebSocket.on('message', (message) => {
      ws.send(String(message));
    });

    ws.on('close', () => {
      owwWebSocket.close();
    });
  });

  const forwardRequest = async (req, res, rootUrl, path, options={}, callback) => {
    try {
      const params = path.match(/:\w+/g) || [];

      let targetPath = path.replace(/\?.*$/, '');
      params.forEach(param => targetPath = targetPath.replace(`${param}`, req.params[param.replace(':', '')]));

      const url = [
        rootUrl.replace(/\/+$/, ''), 
        targetPath.replace(/^\/+/, '')
      ].join('/');

      const queryString = require('qs').stringify(req.query);
      const fullUrl = queryString ? `${url}?${queryString}` : url;

      // Make a request to the target server
      const response = await axios({
        method: req.method,
        url: fullUrl,
        headers: req.headers,
        data: req.body,
        ...options
      });

      if(callback) {
        callback(response)
      } else {
        res.status(response.status).send(response.data);  
      }
    } catch (error) {
      if(error.response && [304, 400, 401, 404, 422].includes(error.response.status)) {
        res.status(error.response.status).send(error.response.data)
        return
      }

      console.error(`Error forwarding request`, error.message);
      if(error.response) {
        console.error(`Status`, error.response.status);
        if(error.response.data) console.error(error.response.data);
      } else {
        console.error(error)
      };
      res.status(500).send('Internal Server Error');
    }
  };

  const restartMqttHub = async(res, responseData) => {
    const response = await axios({
      method: 'post',
      url: `${vanPiApiRootUrl}/mqtt_hub/restart`
    });

    res.status(response.status).send(responseData);
  };

  // Switches state endpoints
  app.post('/relays/:id/state', authenticateUser, async (req, res) => {
    toggleSwitch('relay', parseInt(req.params.id), req, res);
  });

  app.post('/wifi_relays/:id/state', authenticateUser, async (req, res) => {
    toggleSwitch('wifi_relay', parseInt(req.params.id), req, res);
  });

  app.post('/action_switches/:id/state', authenticateUser, async (req, res) => {
    toggleSwitch('action_switch', parseInt(req.params.id), req, res);
  });

  app.post('/modes/:id/state', authenticateUser, async (req, res) => {
    const modeItem = await getSwitchItem('mode', parseInt(req.params.id));
    
    if(!modeItem) {
      return res.status(404).json({ error: `mode not found` });
    }

    const { mode_key } = modeItem;
    forwardRequest(req, res, automationApiRootUrl, `/modes/${mode_key}/state`);
  });

  const toggleSwitch = async(switchType, switchId, req, res) => {
    const {
      actor, 
      state
    } = req.body;

    if([actor, state].includes(undefined)) {
      return res.status(400).json({ error: `\`actor\` and \`state\` are required parameters` });
    }

    const switchItem = await getSwitchItem(switchType, switchId);
    
    if(!switchItem) {
      return res.status(404).json({ error: `${switchType} not found` });
    }

    let payload;

    if(['relay', 'wifi_relay'].includes(switchType)) {
      payload = [ relayStatePayload(switchType, switchItem, actor, state) ];
    } else if(switchType === 'action_switch') {
      const switches = JSON.parse(switchItem.switches);

      payload = await Promise.all(
        switches.map(async ({switch_type: relayType, switch_id: relayId, on_state}) => {
          const relayItem = await getSwitchItem(relayType, relayId);

          return {
            ...relayStatePayload(relayType, relayItem, actor, state),
            ...state ? {state: on_state} : {}
          }
        })
      )
    };

    const response = await axios({
      method: 'post',
      url: `${vanPiApiRootUrl}/relays/state`,
      data: payload
    });

    res.status(response.status).send(response.data);
  };

  const getSwitchItem = async (switchType, switchId) => {
    const tableName = {
      relay: 'relays',
      wifi_relay: 'wifi_relays',
      action_switch: 'action_switches',
      mode: 'modes'
    }[switchType];

    return new Promise((resolve, reject) => {
      pool.query(`SELECT * FROM ${tableName} WHERE id = ?`, [switchId], (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(results[0]);
        }
      });
    });
  };

  const relayStatePayload = (relayType, relayItem, actor, state) => {
    const {
      relay_position,
    } = relayItem;

    return {
      relay_type: relayType,
      ...relayType === 'wifi_relay' ? {
        vendor_id: relayItem.vendor_id,
        mqtt_topic: relayItem.mqtt_topic
      } : {},
      relay_position,
      actor,
      mode: state ? 'subscribe' : 'unsubscribe',
      ...state ? {state: true} : {}
    }
  };

  // Forward endpoints to Core API
  app.put('/settings/:setting_key', authenticateUser, async (req, res) => {
    forwardRequest(req, res, vanPiApiRootUrl, '/settings/:setting_key')
  });

  app.post('/alarm/state', authenticateUser, async (req, res) => {
    forwardRequest(req, res, vanPiApiRootUrl, '/alarm/state')
  });

  app.get('/alarm/state', authenticateUser, async (req, res) => {
    forwardRequest(req, res, vanPiApiRootUrl, '/alarm/state')
  });

  app.get('/relays/state', authenticateUser, async (req, res) => {
    forwardRequest(req, res, vanPiApiRootUrl, '/relays/state')
  });

  app.get('/usb_devices', authenticateUser, async (req, res) => {
    forwardRequest(req, res, vanPiApiRootUrl, '/usb_devices')
  });

  app.get('/gps/state', authenticateUser, async (req, res) => {
    forwardRequest(req, res, vanPiApiRootUrl, '/gps/state')
  });

  app.get('/batteries/state', authenticateUser, async (req, res) => {
    forwardRequest(req, res, vanPiApiRootUrl, '/batteries/state')
  });

  app.get('/water_tanks/state', authenticateUser, async (req, res) => {
    forwardRequest(req, res, vanPiApiRootUrl, '/water_tanks/state')
  });

  app.get('/temperature_sensors/state', authenticateUser, async (req, res) => {
    forwardRequest(req, res, vanPiApiRootUrl, '/temperature_sensors/state')
  });

  app.get('/solar_charge_controllers/state', authenticateUser, async (req, res) => {
    forwardRequest(req, res, vanPiApiRootUrl, '/solar_charge_controllers/state')
  });

  // Forward endpoints to Automation API
  app.post('/modes/:mode_key', authenticateUser, async (req, res) => {
    forwardRequest(req, res, automationApiRootUrl, '/modes/:mode_key')
  });

  app.get('/modes/state', authenticateUser, async (req, res) => {
    forwardRequest(req, res, automationApiRootUrl, '/modes/state')
  });

  // Forward endpoints to Butterfly AI API
  app.post('/butterfly/engine/intent', authenticateUser, async (req, res) => {
    forwardRequest(req, res, butterflyApiRootUrl, '/engine/intent')
  });

  app.post('/butterfly/engine/command_confirmation', authenticateUser, async (req, res) => {
    forwardRequest(req, res, butterflyApiRootUrl, '/engine/command_confirmation')
  });

  app.use('/butterfly/services/:serviceId/:functionName', authenticateUser, async (req, res) => {
    forwardRequest(req, res, butterflyApiRootUrl, '/services/:serviceId/:functionName')
  });

  // Forward endpoints to Frigate API
  app.use('/frigate/*', authenticateUser, async (req, res) => {
    const frigateApiUrl = req.originalUrl.replace(/^\/frigate/, '/api');

    // https://github.com/blakeblackshear/frigate/blob/dev/frigate/http.py#L86
    delete req.headers.origin;

    const jpgRegex = /\.(jpg|jpeg)(\?.*)?$/i;

    let options;
    let callback;
    if(jpgRegex.test(frigateApiUrl)) {
      options = { responseType: "arraybuffer" };
      callback = (response) => {
        res.status(response.status).set({ 'Content-Type': 'image/jpeg' }).send(response.data);
      }
    };
    
    forwardRequest(req, res, frigateApiRootUrl, frigateApiUrl, options, callback);
  });

  // Forward endpoints to Services API
  app.put('/services/credentials/:id', authenticateUser, async (req, res) => {
    forwardRequest(req, res, servicesApiRootUrl, '/credentials/:id')
  });

  app.use('/services/credentials', authenticateUser, async (req, res) => {
    forwardRequest(req, res, servicesApiRootUrl, '/credentials')
  });

  app.use('/services/:serviceId/:endpoint', authenticateUser, async (req, res) => {
    forwardRequest(req, res, servicesApiRootUrl, '/services/:serviceId/:endpoint')
  });

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

  // Settings endpoints
  app.get(`/settings`, authenticateUser, (req, res) => {
    pool.query(`SELECT * FROM settings`, (err, results) => {
      if (err) return handleError(err, res);
      res.json(results);
    });
  });

  // Generic CRUD function with encryption/decryption option
  function createCrudEndpoints(resourceName, tableName, encryptedAttributes = [], callbacks={}) {
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

        const callback = callbacks.create || callbacks.all;
        if(callback) {
          callback(res, decryptedResult);
        } else {
          res.status(201).json(decryptedResult);
        }
      });
    });

    // Update a resource by ID
    app.put(`/${resourceName}/:id`, authenticateUser, (req, res) => {
      const resourceId = parseInt(req.params.id);
      const updatedResource = req.body;

      pool.query(`UPDATE ${tableName} SET ? WHERE id = ?`, [updatedResource, resourceId], (err) => {
        if (err) return handleError(err, res);

        // Return the decrypted result
        const decryptedResult = { ...updatedResource };
        if (encryptedAttributes.length > 0) {
          encryptedAttributes.forEach(attr => {
            decryptedResult[attr] = decryptData(decryptedResult[attr]);
          });
        }

        const callback = callbacks.update || callbacks.all;
        if(callback) {
          callback(res, decryptedResult);
        } else {
          res.status(201).json(decryptedResult);
        }
      });
    });

    // Delete a resource by ID
    app.delete(`/${resourceName}/:id`, authenticateUser, (req, res) => {
      const resourceId = parseInt(req.params.id);

      pool.query(`DELETE FROM ${tableName} WHERE id = ?`, resourceId, (err) => {
        if (err) return handleError(err, res);

        const responseData = { message: `${resourceName} deleted successfully` };

        const callback = callbacks.delete || callbacks.all;
        if(callback) {
          callback(res, responseData);
        } else {
          res.status(201).json(responseData);
        }
      });
    });
  }

  // Create CRUD endpoints
  createCrudEndpoints('relays', 'relays', []);
  createCrudEndpoints('wifi_relays', 'wifi_relays', []);
  createCrudEndpoints('modes', 'modes', []);
  createCrudEndpoints('action_switches', 'action_switches', []);
  createCrudEndpoints('switch_groups', 'switch_groups', []);
  createCrudEndpoints('batteries', 'batteries', []);
  createCrudEndpoints('water_tanks', 'water_tanks', [], {all: restartMqttHub});
  createCrudEndpoints('sensors', 'sensors', [], {all: restartMqttHub});
  createCrudEndpoints('cameras', 'cameras', []);
  createCrudEndpoints('heaters', 'heaters', []);
  createCrudEndpoints('temperature_sensors', 'temperature_sensors', []);
  createCrudEndpoints('solar_charge_controllers', 'solar_charge_controllers', []);

  // Start the server
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
});
