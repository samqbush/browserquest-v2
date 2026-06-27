BrowserQuest server documentation
=================================

The game server runs on Node.js 22 LTS (Phase 1 of the modernization upgraded it
from the original Node 0.4.7). It depends on the following npm libraries:

- underscore
- pino (logging)
- ws (WebSocket transport)
- xss (chat/name sanitization)
- memcache (only if you want metrics)

Install them with `npm install` (this installs a local copy of all dependencies
in the node_modules directory). Start the server with `npm start`.


Configuration
-------------

The server settings (number of worlds, number of players per world, etc.) can be configured.
Copy `config_local.json-dist` to a new `config_local.json` file, then edit it. The server will override default settings with this file.


Deployment
----------

In order to deploy the server, simply copy the `server` and `shared` directories to the staging/production server.

Then run `node server/js/main.js` in order to start the server.


Note: the `shared` directory is the only one in the project which is a server dependency.


Monitoring
----------

The server has a status URL which can be used as a health check or simply as a way to monitor player population.

Send a GET request to: `http://[host]:[port]/status`

It will return a JSON array containing the number of players in all instanced worlds on this game server.
