# VanPi App API

This Express server serves as the backend for the [VanPi React Frontend](https://github.com/coconup/vanpi-react). It provides the needed functionality to handle resources (Switches, batteries, settings etc.) and it also acts as an intermediary to the more low-level APIs [VanPi core](https://github.com/coconup/vanpi-core-api) and [VanPi automation](https://github.com/coconup/vanpi-automation-api).

## Prerequisites

Ensure the following environment variables are set before running the server, preferably through `direnv` as part of the [VanPi Docker Stack](https://github.com/coconup/vanpi-docker-stack):

* `ENCRYPTION_KEY`: Encryption key for securing sensitive data.
* `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: Database connection details.

## Getting Started

1. Within your [VanPi Docker Stack](https://github.com/coconup/vanpi-docker-stack), clone the repository under `volumes`.

2. Start the `docker-compose` stack and access the server at http://raspberrypi.local:3001 (assuming `raspberrypi` is the host you set for your Pi).

## Features

* **CORS:** Headers set based on allowed domains in `VANPI_APP_API_ALLOWED_DOMAINS`.
* **Forwarding Endpoints:** Specific routes forwarded to Van Pi core and Automation APIs.
* **Encryption:** Sensitive data in the database encrypted and decrypted using `ENCRYPTION_KEY`.
* **Database:** Connection details fetched from environment variables. Migrations run on startup.

## Endpoints

* **VanPi core API:**
  * `POST /relays/state`
  * `GET /relays/state`
  * `GET /usb_devices`
  * `GET /batteries/:connection_type/:device_type/:device_id/state`
* **VanPi Automation API:**
  * `POST /modes/:mode_key`
  * `GET /modes/state`
* **Settings:**
  * `GET /settings`
  * `PUT /settings/:setting_key`
* **CRUD Endpoints:**
  * `relays`
  * `wifi_relays`
  * `modes`
  * `action_switches`
  * `switch_groups`
  * `batteries`

## Dependencies

* Key dependencies: `express`, `axios`, `body-parser`, `express-session`, `cors`, `bcrypt`, `mysql2`, `knex`.