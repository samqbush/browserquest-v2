
var cls = require("./lib/class"),
    WebSocketServer = require('ws').Server,
    http = require('http'),
    Utils = require('./utils'),
    WS = {};

module.exports = WS;


/**
 * Abstract Server and Connection classes
 */
var Server = cls.Class.extend({
    init: function(port) {
        this.port = port;
    },
    
    onConnect: function(callback) {
        this.connection_callback = callback;
    },
    
    onError: function(callback) {
        this.error_callback = callback;
    },
    
    broadcast: function(message) {
        throw "Not implemented";
    },
    
    forEachConnection: function(callback) {
        Object.values(this._connections).forEach(callback);
    },
    
    addConnection: function(connection) {
        this._connections[connection.id] = connection;
    },
    
    removeConnection: function(id) {
        delete this._connections[id];
    },
    
    getConnection: function(id) {
        return this._connections[id];
    }
});


var Connection = cls.Class.extend({
    init: function(id, connection, server) {
        this._connection = connection;
        this._server = server;
        this.id = id;
    },
    
    onClose: function(callback) {
        this.close_callback = callback;
    },
    
    listen: function(callback) {
        this.listen_callback = callback;
    },
    
    broadcast: function(message) {
        throw "Not implemented";
    },
    
    send: function(message) {
        throw "Not implemented";
    },
    
    sendUTF8: function(data) {
        throw "Not implemented";
    },
    
    close: function(logError) {
        log.info("Closing connection to "+this._connection._socket.remoteAddress+". Error: "+logError);
        this._connection.close();
    }
});



/**
 * MultiVersionWebsocketServer
 *
 * Single-stack WebSocket server built on the maintained `ws` library (RFC 6455).
 * The historical name is kept so existing callers (main.js) stay untouched; the
 * dual-stack draft-75/76 + hybi support and the BISON codec were removed in
 * Phase 1 of the modernization (every browser shipped in the last decade speaks
 * RFC 6455, and `websocket-server` was unpublished from npm).
 */
WS.MultiVersionWebsocketServer = Server.extend({
    _connections: {},
    _counter: 0,
    
    init: function(port) {
        var self = this;
        
        this._super(port);
        
        this._httpServer = http.createServer(function(request, response) {
            var path = new URL(request.url, 'http://localhost').pathname;
            switch(path) {
                case '/status':
                    if(self.status_callback) {
                        response.writeHead(200);
                        response.write(self.status_callback());
                        break;
                    }
                    response.writeHead(404);
                    break;
                case '/metrics':
                    if(self.metrics_callback) {
                        Promise.resolve(self.metrics_callback()).then(function(result) {
                            response.writeHead(200, { 'Content-Type': self.metrics_content_type || 'text/plain' });
                            response.end(result);
                        }).catch(function(error) {
                            log.error("Error generating metrics: " + error);
                            response.writeHead(500);
                            response.end();
                        });
                        return;
                    }
                    response.writeHead(404);
                    break;
                default:
                    response.writeHead(404);
            }
            response.end();
        });
        this._httpServer.listen(port, function() {
            log.info("Server is listening on port "+port);
        });
        this._httpServer.on('error', function(error) {
            if(self.error_callback) {
                self.error_callback(error);
            }
        });
        
        this._wsServer = new WebSocketServer({ server: this._httpServer });
        this._wsServer.on('error', function(error) {
            if(self.error_callback) {
                self.error_callback(error);
            }
        });
        this._wsServer.on('connection', function(connection, request) {
            // Preserve the remoteAddress property the old code exposed.
            connection.remoteAddress = request.socket.remoteAddress;
            
            var c = new WS.wsConnection(self._createId(), connection, self);
            
            if(self.connection_callback) {
                self.connection_callback(c);
            }
            self.addConnection(c);
        });
    },
    
    _createId: function() {
        return '5' + Utils.random(99) + '' + (this._counter++);
    },
    
    broadcast: function(message) {
        this.forEachConnection(function(connection) {
            connection.send(message);
        });
    },
    
    onRequestStatus: function(status_callback) {
        this.status_callback = status_callback;
    },
    
    onRequestMetrics: function(metrics_callback, contentType) {
        this.metrics_callback = metrics_callback;
        this.metrics_content_type = contentType;
    },
    
    close: function(callback) {
        var self = this;
        this._wsServer.close(function() {
            self._httpServer.close(callback);
        });
    }
});


/**
 * Connection class for the `ws` library (RFC 6455).
 */
WS.wsConnection = Connection.extend({
    init: function(id, connection, server) {
        var self = this;
        
        this._super(id, connection, server);
        
        this._connection.on('message', function(data, isBinary) {
            if(isBinary) {
                self.close("Received binary frame; only UTF-8 JSON is supported.");
                return;
            }
            if(self.listen_callback) {
                var text = data.toString('utf8');
                try {
                    self.listen_callback(JSON.parse(text));
                } catch(e) {
                    if(e instanceof SyntaxError) {
                        self.close("Received message was not valid JSON.");
                    } else {
                        throw e;
                    }
                }
            }
        });
        
        this._connection.on('error', function(error) {
            if(self._server.error_callback) {
                self._server.error_callback(error);
            }
        });
        
        this._connection.on('close', function() {
            if(self.close_callback) {
                self.close_callback();
            }
            self._server.removeConnection(self.id);
        });
    },
    
    send: function(message) {
        this.sendUTF8(JSON.stringify(message));
    },
    
    sendUTF8: function(data) {
        this._connection.send(data);
    }
});
