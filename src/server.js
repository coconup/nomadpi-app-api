const express = require('express');
const expressWs = require('express-ws');
const WebSocket = require('ws');
const { WsReconnect } = require('websocket-reconnect');
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

if(!process.env.ENCRYPTION_KEY) throw `\`$ENCRYPTION_KEY\` is not set`;
if(!process.env.RPI_HOSTNAME) throw `\`$RPI_HOSTNAME\` is not set`;
if(!process.env.CORE_API_ROOT_URL) throw `\`$CORE_API_ROOT_URL\` is not set`;
if(!process.env.AUTOMATION_API_ROOT_URL) throw `\`$AUTOMATION_API_ROOT_URL\` is not set`;
if(!process.env.BUTTERFLY_API_ROOT_URL) throw `\`$BUTTERFLY_API_ROOT_URL\` is not set`;
if(!process.env.SERVICES_API_ROOT_URL) throw `\`$SERVICES_API_ROOT_URL\` is not set`;
if(!process.env.FRIGATE_API_ROOT_URL) throw `\`$FRIGATE_API_ROOT_URL\` is not set`;
if(!process.env.OPEN_WAKE_WORD_WS_URL) throw `\`$OPEN_WAKE_WORD_WS_URL\` is not set`;

// Set constants

const [
  encryptionKey,
  raspberryPiHostname,
  coreApiBaseUrl,
  automationApiBaseUrl,
  butterflyApiRootUrl,
  servicesApiRootUrl,
  frigateApiRootUrl,
  openWakeWordWsUrl
] = [
  process.env.ENCRYPTION_KEY,
  process.env.RPI_HOSTNAME,
  `${process.env.CORE_API_ROOT_URL}/api/v1`,
  `${process.env.AUTOMATION_API_ROOT_URL}/api/v1`,
  process.env.BUTTERFLY_API_ROOT_URL,
  process.env.SERVICES_API_ROOT_URL,
  process.env.FRIGATE_API_ROOT_URL,
  process.env.OPEN_WAKE_WORD_WS_URL
];

const coreApiWsRootUrl = `${coreApiBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://')}/ws`;
const automationApiWsRootUrl = `${automationApiBaseUrl.replace('https://', 'wss://').replace('http://', 'ws://')}/ws`;

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

// Initialize WebSockets
const { getWss } = expressWs(app);

// Create a MySQL connection pool
const pool = mysql.createPool(databaseConfig);

// Migration configuration
const knexConfig = require('./knexfile');
const knexInstance = knex(knexConfig.development);

// Run migrations
knexInstance.migrate.latest().then(() => {
  console.log('Migrations ran successfully.');

  let isInitialized = false;
  let cloudflareAppUrl;

  function initialize() {
    return new Promise((resolve, reject) => {
      if (isInitialized) {
        resolve();
        return;
      }

      pool.query('SELECT value FROM settings WHERE setting_key = "cloudflare_app_url"', (error, results) => {
        if (error) {
          reject(error);
        } else {
          if (results.length > 0) {
            cloudflareAppUrl = results[0].value;
            console.log('Cloudflare App URL:', cloudflareAppUrl);
          } else {
            console.log('Cloudflare App URL not found in the database.');
          }

          // Set the flag to true after initialization
          isInitialized = true;
          resolve();
        }
      });
    });
  }

  app.use(async (req, res, next) => {
    await initialize();
    next();
  });

  // Add headers before the routes are defined
  app.use(async function(req, res, next) {
    const corsWhitelist = [
      `http://${raspberryPiHostname}:3000`,
      `http://localhost:3000`,
      ...cloudflareAppUrl ? [cloudflareAppUrl] : []
    ];

    // if (corsWhitelist.includes(req.headers.origin)) {
    if(req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    }
    // } else {
    //   console.log(`Rejected request from origin \`${req.headers.origin}\``)
    // }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type,Accept');
    res.setHeader('Access-Control-Allow-Credentials', true);

    next();
  });

  // Middleware to parse JSON requests
  app.use(bodyParser.json());

  function handleError(error, res) {
    console.log(JSON.stringify(error))
    return res.status(400).json({message: error.sqlMessage});
  }

  // Open wake word internal websocket forwarding
  app.ws('/ws/open_wake_word', (ws, req) => {
    console.log(`connecting to open_wake_word`)
    const openWakeWordWebsocket = new WsReconnect({ reconnectDelay: 5000 });
    openWakeWordWebsocket.open(openWakeWordWsUrl);

    ws.on('message', (message) => {
      try {
        openWakeWordWebsocket.send(message);
      } catch(error) {

      }
    });

    openWakeWordWebsocket.on('message', (message) => {
      ws.send(String(message));
    });

    openWakeWordWebsocket.on('open', () => {
      console.log(`connected to open_wake_word`)
    });

    ws.on('close', () => {
      try {
        console.log(`closing connection with open_wake_word`)
        openWakeWordWebsocket.close();
      } catch(error) {
        console.log(`error closing connection with open_wake_word`)
      }
    });
  });

  [
    'relays',
    'modes',
    'gps',
    'batteries',
    'solar_charge_controllers',
    'temperature_sensors',
    'water_tanks',
    'alarm'
  ].forEach(resourceName => {
    const websocket = new WsReconnect({ reconnectDelay: 5000 });
    const baseUrl = resourceName === 'modes' ? automationApiWsRootUrl : coreApiWsRootUrl;
    const url = `${baseUrl}/${resourceName}/state`;
    websocket.open(url);

    app.ws(`/ws/${resourceName}/state`, (ws, req) => {
      websocket.on('open', () => {
        console.log(`${resourceName} connected to ${url}`)
      });

      websocket.on('reconnect', () => {
        console.log(`${resourceName} reconnected to ${url}`)
      });

      websocket.on('message', (message) => {
        ws.send(String(message));
      });

      websocket.on('error', (err) => {
        console.log(`${resourceName} websocket error: ${error}`);
      });

      websocket.on('close', () => {
        console.log(`${resourceName} websocket closed`);
      });
    });
  });

  const forwardError = (error, res) => {
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
      forwardError(error, res);
    }
  };

  const restartMqttHub = async(res, responseData) => {
    const response = await axios({
      method: 'post',
      url: `${coreApiBaseUrl}/mqtt_hub/restart`
    });

    res.status(response.status).send(responseData);
  };

  // Switches state endpoints
  app.post('/relays/:id/state', async (req, res) => {
    toggleSwitch('relay', parseInt(req.params.id), req, res);
  });

  app.post('/wifi_relays/:id/state', async (req, res) => {
    toggleSwitch('wifi_relay', parseInt(req.params.id), req, res);
  });

  app.post('/action_switches/:id/state', async (req, res) => {
    toggleSwitch('action_switch', parseInt(req.params.id), req, res);
  });

  app.post('/modes/:id/state', async (req, res) => {
    const modeItem = await getSwitchItem('mode', parseInt(req.params.id));
    
    if(!modeItem) {
      return res.status(404).json({ error: `mode not found` });
    }

    const { mode_key } = modeItem;
    forwardRequest(req, res, automationApiBaseUrl, `/modes/${mode_key}/state`);
  });

  const toggleSwitch = async(switchableType, switchableId, req, res) => {
    const {
      actor, 
      state
    } = req.body;

    if([actor, state].includes(undefined)) {
      return res.status(400).json({ error: `\`actor\` and \`state\` are required parameters` });
    }

    try {
      const switchItem = await getSwitchItem(switchType, switchId);
    
      if(!switchItem) {
        return res.status(404).json({ error: `${switchType} not found` });
      }

      let payload;

      if(switchType === 'action_switch') {
        const switches = JSON.parse(switchItem.switches);

        payload = await Promise.all(
          switches.map(async ({switch_type, switch_id, on_state}) => {
            return {
              ...switchableStatePayload(switch_type, switch_id, actor, state),
              ...state ? {state: on_state} : {}
            }
          })
        )
      } else {
        payload = [ switchableStatePayload(switchableType, switchableId, actor, state) ];
      };

      const response = await axios({
        method: 'post',
        url: `${coreApiBaseUrl}/switchables/state`,
        data: payload
      });

      res.status(response.status).send(response.data);
    } catch (error) {
      forwardError(error, res);
    }
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

  const switchableStatePayload = (switchableType, switchableId, actor, state) => {
    return {
      switchable_type: switchableType,
      switchable_id: switchableId,
      actor,
      mode: state ? 'subscribe' : 'unsubscribe',
      ...state ? {state: true} : {}
    }
  };

  // Forward endpoints to Core API
  app.put('/settings/:setting_key', async (req, res) => {
    isInitialized = false;
    forwardRequest(req, res, coreApiBaseUrl, '/settings/:setting_key')
  });

  app.post('/alarm/state', async (req, res) => {
    forwardRequest(req, res, coreApiBaseUrl, '/alarm/state')
  });

  app.get('/alarm/state', async (req, res) => {
    forwardRequest(req, res, coreApiBaseUrl, '/alarm/state')
  });

  app.get('/switchables/state', async (req, res) => {
    forwardRequest(req, res, coreApiBaseUrl, '/switchables/state')
  });

  app.get('/usb_devices', async (req, res) => {
    forwardRequest(req, res, coreApiBaseUrl, '/usb_devices')
  });

  app.get('/gps/state', async (req, res) => {
    forwardRequest(req, res, coreApiBaseUrl, '/gps/state')
  });

  app.get('/batteries/state', async (req, res) => {
    forwardRequest(req, res, coreApiBaseUrl, '/batteries/state')
  });

  app.get('/water_tanks/state', async (req, res) => {
    forwardRequest(req, res, coreApiBaseUrl, '/water_tanks/state')
  });

  app.get('/temperature_sensors/state', async (req, res) => {
    forwardRequest(req, res, coreApiBaseUrl, '/temperature_sensors/state')
  });

  app.get('/solar_charge_controllers/state', async (req, res) => {
    forwardRequest(req, res, coreApiBaseUrl, '/solar_charge_controllers/state')
  });

  // Forward endpoints to Automation API
  app.post('/modes/:mode_key', async (req, res) => {
    forwardRequest(req, res, automationApiBaseUrl, '/modes/:mode_key')
  });

  app.get('/modes/state', async (req, res) => {
    forwardRequest(req, res, automationApiBaseUrl, '/modes/state')
  });

  // Forward endpoints to Butterfly AI API
  app.post('/butterfly/engine/intent', async (req, res) => {
    forwardRequest(req, res, butterflyApiRootUrl, '/engine/intent')
  });

  app.post('/butterfly/engine/command_confirmation', async (req, res) => {
    forwardRequest(req, res, butterflyApiRootUrl, '/engine/command_confirmation')
  });

  app.use('/butterfly/services/:serviceId/:functionName', async (req, res) => {
    forwardRequest(req, res, butterflyApiRootUrl, '/services/:serviceId/:functionName')
  });

  // Forward endpoints to Frigate API
  app.use('/frigate/*', async (req, res) => {
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
  app.get('/services/credentials/service/:service_id', async (req, res) => {
    forwardRequest(req, res, servicesApiRootUrl, '/credentials/service/:service_id')
  });

  app.put('/services/credentials/:id', async (req, res) => {
    forwardRequest(req, res, servicesApiRootUrl, '/credentials/:id')
  });

  app.use('/services/credentials', async (req, res) => {
    forwardRequest(req, res, servicesApiRootUrl, '/credentials')
  });

  app.use('/services/:serviceId/:endpoint', async (req, res) => {
    forwardRequest(req, res, servicesApiRootUrl, '/services/:serviceId/:endpoint')
  });

  // Settings endpoints
  app.get(`/settings`, (req, res) => {
    pool.query(`SELECT * FROM settings`, (err, results) => {
      if (err) return handleError(err, res);
      res.json(results);
    });
  });

  // Generic CRUD function
  function createCrudEndpoints(resourceName, tableName, callbacks={}) {
    // Get all resources
    app.get(`/${resourceName}`, (req, res) => {
      pool.query(`SELECT * FROM ${tableName}`, (err, results) => {
        if (err) return handleError(err, res);

        res.json(results);
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

        res.json(results[0]);
      });
    });

    // Create a new resource
    app.post(`/${resourceName}`, (req, res) => {
      const newResource = req.body;

      pool.query(`INSERT INTO ${tableName} SET ?`, newResource, (err, results) => {
        if (err) return handleError(err, res);

        newResource.id = results.insertId;

        const callback = callbacks.create || callbacks.all;
        if(callback) {
          callback(res, newResource);
        } else {
          res.status(201).json(newResource);
        }
      });
    });

    // Update a resource by ID
    app.put(`/${resourceName}/:id`, (req, res) => {
      const resourceId = parseInt(req.params.id);
      const updatedResource = req.body;

      pool.query(`UPDATE ${tableName} SET ? WHERE id = ?`, [updatedResource, resourceId], (err) => {
        if (err) return handleError(err, res);
        
        const callback = callbacks.update || callbacks.all;
        if(callback) {
          callback(res, updatedResource);
        } else {
          res.status(201).json(updatedResource);
        }
      });
    });

    // Delete a resource by ID
    app.delete(`/${resourceName}/:id`, (req, res) => {
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
  createCrudEndpoints('relays', 'relays');
  createCrudEndpoints('wifi_relays', 'wifi_relays');
  createCrudEndpoints('modes', 'modes');
  createCrudEndpoints('action_switches', 'action_switches');
  createCrudEndpoints('switch_groups', 'switch_groups');
  createCrudEndpoints('batteries', 'batteries');
  createCrudEndpoints('water_tanks', 'water_tanks', {all: restartMqttHub});
  createCrudEndpoints('sensors', 'sensors', {all: restartMqttHub});
  createCrudEndpoints('cameras', 'cameras');
  createCrudEndpoints('heaters', 'heaters');
  createCrudEndpoints('temperature_sensors', 'temperature_sensors', {all: restartMqttHub});
  createCrudEndpoints('solar_charge_controllers', 'solar_charge_controllers');

  // Start the server
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
});
