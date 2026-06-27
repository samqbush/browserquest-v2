
var cls = require("./lib/class"),
    client = require("prom-client");

// Modern, single-host metrics backed by `prom-client`. Replaces the old
// memcached-based multi-host population counter. Player counts are derived
// locally from the in-process worlds and exposed as a scrapeable Prometheus
// `/metrics` endpoint. Each instance owns its own registry so the module can
// be instantiated more than once (e.g. in tests) without "metric already
// registered" collisions on a shared global registry.
module.exports = Metrics = cls.Class.extend({
    init: function(config) {
        this.config = config;
        this.isReady = true;

        this.registry = new client.Registry();

        this.playerCountGauge = new client.Gauge({
            name: 'bq_players_total',
            help: 'Total number of connected players across all worlds on this server.',
            registers: [this.registry]
        });
        this.worldPlayerCountGauge = new client.Gauge({
            name: 'bq_world_players',
            help: 'Number of connected players in a given world.',
            labelNames: ['world'],
            registers: [this.registry]
        });
        this.worldCountGauge = new client.Gauge({
            name: 'bq_worlds_total',
            help: 'Number of game worlds hosted on this server.',
            registers: [this.registry]
        });
    },

    ready: function(callback) {
        if(callback) {
            callback();
        }
    },

    getTotalPlayers: function(worlds) {
        return worlds.reduce(function(sum, world) { return sum + world.playerCount; }, 0);
    },

    updatePlayerCounters: function(worlds, updatedCallback) {
        var total = this.getTotalPlayers(worlds);

        this.playerCountGauge.set(total);
        this.worldCountGauge.set(worlds.length);
        this.updateWorldDistribution(worlds);

        if(updatedCallback) {
            updatedCallback(total);
        }
    },

    updateWorldDistribution: function(worlds) {
        var gauge = this.worldPlayerCountGauge;
        worlds.forEach(function(world) {
            gauge.set({ world: world.id }, world.playerCount);
        });
    },

    // Returns a Promise<string> of the Prometheus exposition-format metrics.
    getMetrics: function() {
        return this.registry.metrics();
    },

    getContentType: function() {
        return this.registry.contentType;
    }
});
