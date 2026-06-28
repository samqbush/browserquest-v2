
// @ts-check
var Types = require("../../shared/js/gametypes");

(function() {
    FormatChecker = Class.extend({
        init: function() {
            this.formats = [];
            this.formats[Types.Messages.HELLO] = ['s', 'n', 'n'],
            this.formats[Types.Messages.MOVE] = ['n', 'n'],
            this.formats[Types.Messages.LOOTMOVE] = ['n', 'n', 'n'],
            this.formats[Types.Messages.AGGRO] = ['n'],
            this.formats[Types.Messages.ATTACK] = ['n'],
            this.formats[Types.Messages.HIT] = ['n'],
            this.formats[Types.Messages.HURT] = ['n'],
            this.formats[Types.Messages.CHAT] = ['s'],
            this.formats[Types.Messages.LOOT] = ['n'],
            this.formats[Types.Messages.TELEPORT] = ['n', 'n'],
            this.formats[Types.Messages.ZONE] = [],
            this.formats[Types.Messages.OPEN] = ['n'],
            this.formats[Types.Messages.CHECK] = ['n']
        },
        
        check: function(msg) {
            var message = msg.slice(0),
                type = message[0],
                format = this.formats[type];
            
            message.shift();

            // HELLO carries an OPTIONAL trailing reconnect token (Phase 4):
            // [name(s), armor(n), weapon(n)] or [..., token(s)]. The relaxation
            // is unconditional (not gated on persistence) so a client carrying a
            // stored token is never rejected by a server with persistence off.
            if(type === Types.Messages.HELLO) {
                if(message.length !== 3 && message.length !== 4) {
                    return false;
                }
                if(typeof message[0] !== 'string') { return false; }
                if(typeof message[1] !== 'number') { return false; }
                if(typeof message[2] !== 'number') { return false; }
                if(message.length === 4 && (typeof message[3] !== 'string' || message[3].length > 64)) {
                    return false;
                }
                return true;
            }
            
            if(format) {    
                if(message.length !== format.length) {
                    return false;
                }
                for(var i = 0, n = message.length; i < n; i += 1) {
                    if(format[i] === 'n' && typeof message[i] !== 'number') {
                        return false;
                    }
                    if(format[i] === 's' && typeof message[i] !== 'string') {
                        return false;
                    }
                }
                return true;
            }
            else if(type === Types.Messages.WHO) {
                // WHO messages have a variable amount of params, all of which must be numbers.
                return message.length > 0 && message.every(function(param) { return typeof param === 'number'; });
            }
            else {
                log.error("Unknown message type: "+type);
                return false;
            }
        }
    });

    var checker = new FormatChecker;
    
    exports.check = checker.check.bind(checker);
})();