
var fs = require('fs'),
    Metrics = require('./metrics');


function main(config) {
    var ws = require("./ws"),
        WorldServer = require("./worldserver"),
        Log = require('./log'),
        server = new ws.MultiVersionWebsocketServer(config.port),
        metrics = new Metrics(config),
        worlds = [],
        lastTotalPlayers = 0,
        checkPopulationInterval = setInterval(function() {
            var totalPlayers = metrics.getTotalPlayers(worlds);
            if(config.metrics_enabled && totalPlayers !== lastTotalPlayers) {
                lastTotalPlayers = totalPlayers;
                worlds.forEach(function(world) {
                    world.updatePopulation(totalPlayers);
                });
            }
        }, 1000);
    
    switch(config.debug_level) {
        case "error":
            log = new Log(Log.ERROR); break;
        case "debug":
            log = new Log(Log.DEBUG); break;
        case "info":
            log = new Log(Log.INFO); break;
    };
    
    log.info("Starting BrowserQuest game server...");
    
    server.onConnect(function(connection) {
        var world, // the one in which the player will be spawned
            connect = function() {
                if(world) {
                    world.connect_callback(new Player(connection, world));
                }
            };
        
        // Choose the least populated world among those that still have capacity.
        var openWorlds = worlds.filter(function(w) {
            return w.playerCount < config.nb_players_per_world;
        });
        world = openWorlds.reduce(function(least, w) {
            return (least && least.playerCount <= w.playerCount) ? least : w;
        }, null);
        
        if(world) {
            world.updatePopulation();
            connect();
        } else {
            log.error("All worlds are full; refusing connection.");
        }
    });

    server.onError(function() {
        log.error(Array.prototype.join.call(arguments, ", "));
    });
    
    var onPopulationChange = function() {
        metrics.updatePlayerCounters(worlds, function(totalPlayers) {
            if(config.metrics_enabled) {
                worlds.forEach(function(world) {
                    world.updatePopulation(totalPlayers);
                });
            }
        });
    };

    for(var i = 0; i < config.nb_worlds; i += 1) {
        var world = new WorldServer('world'+ (i+1), config.nb_players_per_world, server);
        world.run(config.map_filepath);
        worlds.push(world);
        world.onPlayerAdded(onPopulationChange);
        world.onPlayerRemoved(onPopulationChange);
    }
    
    server.onRequestStatus(function() {
        return JSON.stringify(getWorldDistribution(worlds));
    });
    
    server.onRequestMetrics(function() {
        return metrics.getMetrics();
    }, metrics.getContentType());
    
    // Initialize all counters when the server starts.
    onPopulationChange();
    
    process.on('uncaughtException', function (e) {
        log.error('uncaughtException: ' + e);
    });
}

function getWorldDistribution(worlds) {
    var distribution = [];
    
    worlds.forEach(function(world) {
        distribution.push(world.playerCount);
    });
    return distribution;
}

function getConfigFile(path, callback) {
    fs.readFile(path, 'utf8', function(err, json_string) {
        if(err) {
            console.error("Could not open config file:", err.path);
            callback(null);
        } else {
            callback(JSON.parse(json_string));
        }
    });
}

var defaultConfigPath = './server/config.json',
    customConfigPath = './server/config_local.json';

process.argv.forEach(function (val, index, array) {
    if(index === 2) {
        customConfigPath = val;
    }
});

getConfigFile(defaultConfigPath, function(defaultConfig) {
    getConfigFile(customConfigPath, function(localConfig) {
        if(localConfig) {
            main(localConfig);
        } else if(defaultConfig) {
            main(defaultConfig);
        } else {
            console.error("Server cannot start without any configuration file.");
            process.exit(1);
        }
    });
});
