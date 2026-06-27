
var cls = require("./lib/class"),
    Messages = require("./message"),
    Utils = require("./utils"),
    Properties = require("./properties"),
    Formulas = require("./formulas"),
    check = require("./format").check,
    PlayerStore = require("./playerstore"),
    Types = require("../../shared/js/gametypes");

module.exports = Player = Character.extend({
    init: function(connection, worldServer) {
        var self = this;
        
        this.server = worldServer;
        this.connection = connection;

        this._super(this.connection.id, "player", Types.Entities.WARRIOR, 0, 0, "");

        this.hasEnteredGame = false;
        this.isDead = false;
        this.haters = {};
        this.lastCheckpoint = null;
        this.formatChecker = new FormatChecker();
        this.disconnectTimeout = null;

        // Phase 4 persistence: store + token are null unless persistence is on.
        this.store = worldServer.store || null;
        this.sessions = worldServer.sessions || null;
        this.token = null;
        this.session = null;
        this.isSuperseded = false;
        this.hasRestoredPosition = false;
        this.saveTimeout = null;
        
        this.connection.listen(function(message) {
            var action = parseInt(message[0]);

            // Redact the HELLO bearer token (message[4]) before logging or
            // echoing the raw message back in a close reason, so credentials
            // never leak into logs.
            var redacted = message;
            if(action === Types.Messages.HELLO && Array.isArray(message) && message.length > 4) {
                redacted = message.slice();
                redacted[4] = "[redacted]";
            }

            log.debug("Received: "+redacted);
            if(!check(message)) {
                self.connection.close("Invalid "+Types.getMessageTypeAsString(action)+" message format: "+redacted);
                return;
            }
            
            if(!self.hasEnteredGame && action !== Types.Messages.HELLO) { // HELLO must be the first message
                self.connection.close("Invalid handshake message: "+redacted);
                return;
            }
            if(self.hasEnteredGame && !self.isDead && action === Types.Messages.HELLO) { // HELLO can be sent only once
                self.connection.close("Cannot initiate handshake twice: "+redacted);
                return;
            }
            
            self.resetTimeout();
            
            if(action === Types.Messages.HELLO) {
                var name = Utils.sanitize(message[1]);
                
                // If name was cleared by the sanitizer, give a default name.
                // Always ensure that the name is not longer than a maximum length.
                // (also enforced by the maxlength attribute of the name input element).
                self.name = (name === "") ? "lorem ipsum" : name.substr(0, 15);
                
                self.kind = Types.Entities.WARRIOR;
                self.equipArmor(message[2]);
                self.equipWeapon(message[3]);
                self.orientation = Utils.randomOrientation();

                // Phase 4: restore persisted state if a valid token was sent.
                // This may overwrite name/gear/orientation and restore position.
                var presentedToken = (typeof message[4] === 'string' && message[4].length > 0) ? message[4] : null;
                self.loadPersistedState(presentedToken);

                self.updateHitPoints();
                if(!self.hasRestoredPosition) {
                    self.updatePosition();
                }
                
                self.server.addPlayer(self);
                self.server.enter_callback(self);

                var welcome = [Types.Messages.WELCOME, self.id, self.name, self.x, self.y, self.hitPoints];
                if(self.store) {
                    // Append server-authoritative gear/orientation + echoed token
                    // so the returning client matches what others see via SPAWN.
                    welcome.push(self.orientation, self.armor, self.weapon, self.token);
                }
                self.send(welcome);
                self.hasEnteredGame = true;
                self.isDead = false;
            }
            else if(action === Types.Messages.WHO) {
                message.shift();
                self.server.pushSpawnsToPlayer(self, message);
            }
            else if(action === Types.Messages.ZONE) {
                self.zone_callback();
            }
            else if(action === Types.Messages.CHAT) {
                var msg = Utils.sanitize(message[1]);
                
                // Sanitized messages may become empty. No need to broadcast empty chat messages.
                if(msg && msg !== "") {
                    msg = msg.substr(0, 60); // Enforce maxlength of chat input
                    self.broadcastToZone(new Messages.Chat(self, msg), false);
                }
            }
            else if(action === Types.Messages.MOVE) {
                if(self.move_callback) {
                    var x = message[1],
                        y = message[2];
                    
                    if(self.server.isValidPosition(x, y)) {
                        self.setPosition(x, y);
                        self.clearTarget();
                        
                        self.broadcast(new Messages.Move(self));
                        self.move_callback(self.x, self.y);
                        self.scheduleSave();
                    }
                }
            }
            else if(action === Types.Messages.LOOTMOVE) {
                if(self.lootmove_callback) {
                    self.setPosition(message[1], message[2]);
                    
                    var item = self.server.getEntityById(message[3]);
                    if(item) {
                        self.clearTarget();

                        self.broadcast(new Messages.LootMove(self, item));
                        self.lootmove_callback(self.x, self.y);
                        self.scheduleSave();
                    }
                }
            }
            else if(action === Types.Messages.AGGRO) {
                if(self.move_callback) {
                    self.server.handleMobHate(message[1], self.id, 5);
                }
            }
            else if(action === Types.Messages.ATTACK) {
                var mob = self.server.getEntityById(message[1]);
                
                if(mob) {
                    self.setTarget(mob);
                    self.server.broadcastAttacker(self);
                }
            }
            else if(action === Types.Messages.HIT) {
                var mob = self.server.getEntityById(message[1]);
                if(mob) {
                    var dmg = Formulas.dmg(self.weaponLevel, mob.armorLevel);
                    
                    if(dmg > 0) {
                        mob.receiveDamage(dmg, self.id);
                        self.server.handleMobHate(mob.id, self.id, dmg);
                        self.server.handleHurtEntity(mob, self, dmg);
                    }
                }
            }
            else if(action === Types.Messages.HURT) {
                var mob = self.server.getEntityById(message[1]);
                if(mob && self.hitPoints > 0) {
                    self.hitPoints -= Formulas.dmg(mob.weaponLevel, self.armorLevel);
                    self.server.handleHurtEntity(self);
                    
                    if(self.hitPoints <= 0) {
                        self.isDead = true;
                        if(self.firepotionTimeout) {
                            clearTimeout(self.firepotionTimeout);
                        }
                    }
                }
            }
            else if(action === Types.Messages.LOOT) {
                var item = self.server.getEntityById(message[1]);
                
                if(item) {
                    var kind = item.kind;
                    
                    if(Types.isItem(kind)) {
                        self.broadcast(item.despawn());
                        self.server.removeEntity(item);
                        
                        if(kind === Types.Entities.FIREPOTION) {
                            self.updateHitPoints();
                            self.broadcast(self.equip(Types.Entities.FIREFOX));
                            self.firepotionTimeout = setTimeout(function() {
                                self.broadcast(self.equip(self.armor)); // return to normal after 15 sec
                                self.firepotionTimeout = null;
                            }, 15000);
                            self.send(new Messages.HitPoints(self.maxHitPoints).serialize());
                        } else if(Types.isHealingItem(kind)) {
                            var amount;
                            
                            switch(kind) {
                                case Types.Entities.FLASK: 
                                    amount = 40;
                                    break;
                                case Types.Entities.BURGER: 
                                    amount = 100;
                                    break;
                            }
                            
                            if(!self.hasFullHealth()) {
                                self.regenHealthBy(amount);
                                self.server.pushToPlayer(self, self.health());
                            }
                        } else if(Types.isArmor(kind) || Types.isWeapon(kind)) {
                            self.equipItem(item);
                            self.broadcast(self.equip(kind));
                            self.savePersistedState(); // gear change is durable
                        }
                    }
                }
            }
            else if(action === Types.Messages.TELEPORT) {
                var x = message[1],
                    y = message[2];
                
                if(self.server.isValidPosition(x, y)) {
                    self.setPosition(x, y);
                    self.clearTarget();
                    
                    self.broadcast(new Messages.Teleport(self));
                    
                    self.server.handlePlayerVanish(self);
                    self.server.pushRelevantEntityListTo(self);
                    self.savePersistedState();
                }
            }
            else if(action === Types.Messages.OPEN) {
                var chest = self.server.getEntityById(message[1]);
                if(chest && chest instanceof Chest) {
                    self.server.handleOpenedChest(chest, self);
                }
            }
            else if(action === Types.Messages.CHECK) {
                var checkpoint = self.server.map.getCheckpoint(message[1]);
                if(checkpoint) {
                    self.lastCheckpoint = checkpoint;
                    self.savePersistedState(); // checkpoint is a durable spawn
                }
            }
            else {
                if(self.message_callback) {
                    self.message_callback(message);
                }
            }
        });
        
        this.connection.onClose(function() {
            if(self.firepotionTimeout) {
                clearTimeout(self.firepotionTimeout);
            }
            clearTimeout(self.disconnectTimeout);
            clearTimeout(self.saveTimeout);
            self.savePersistedState();
            if(self.sessions && self.token) {
                self.sessions.release(self.token, self.session);
            }
            if(self.exit_callback) {
                self.exit_callback();
            }
        });
        
        this.connection.sendUTF8("go"); // Notify client that the HELLO/WELCOME handshake can start
    },
    
    destroy: function() {
        var self = this;
        
        this.forEachAttacker(function(mob) {
            mob.clearTarget();
        });
        this.attackers = {};
        
        this.forEachHater(function(mob) {
            mob.forgetPlayer(self.id);
        });
        this.haters = {};
    },
    
    getState: function() {
        var basestate = this._getBaseState(),
            state = [this.name, this.orientation, this.armor, this.weapon];

        if(this.target) {
            state.push(this.target);
        }
        
        return basestate.concat(state);
    },
    
    send: function(message) {
        this.connection.send(message);
    },
    
    broadcast: function(message, ignoreSelf) {
        if(this.broadcast_callback) {
            this.broadcast_callback(message, ignoreSelf === undefined ? true : ignoreSelf);
        }
    },
    
    broadcastToZone: function(message, ignoreSelf) {
        if(this.broadcastzone_callback) {
            this.broadcastzone_callback(message, ignoreSelf === undefined ? true : ignoreSelf);
        }
    },
    
    onExit: function(callback) {
        this.exit_callback = callback;
    },
    
    onMove: function(callback) {
        this.move_callback = callback;
    },
    
    onLootMove: function(callback) {
        this.lootmove_callback = callback;
    },
    
    onZone: function(callback) {
        this.zone_callback = callback;
    },
    
    onOrient: function(callback) {
        this.orient_callback = callback;
    },
    
    onMessage: function(callback) {
        this.message_callback = callback;
    },
    
    onBroadcast: function(callback) {
        this.broadcast_callback = callback;
    },
    
    onBroadcastToZone: function(callback) {
        this.broadcastzone_callback = callback;
    },
    
    equip: function(item) {
        return new Messages.EquipItem(this, item);
    },
    
    addHater: function(mob) {
        if(mob) {
            if(!(mob.id in this.haters)) {
                this.haters[mob.id] = mob;
            }
        }
    },
    
    removeHater: function(mob) {
        if(mob && mob.id in this.haters) {
            delete this.haters[mob.id];
        }
    },
    
    forEachHater: function(callback) {
        Object.values(this.haters).forEach(function(mob) {
            callback(mob);
        });
    },
    
    equipArmor: function(kind) {
        this.armor = kind;
        this.armorLevel = Properties.getArmorLevel(kind);
    },
    
    equipWeapon: function(kind) {
        this.weapon = kind;
        this.weaponLevel = Properties.getWeaponLevel(kind);
    },
    
    equipItem: function(item) {
        if(item) {
            log.debug(this.name + " equips " + Types.getKindAsString(item.kind));
            
            if(Types.isArmor(item.kind)) {
                this.equipArmor(item.kind);
                this.updateHitPoints();
                this.send(new Messages.HitPoints(this.maxHitPoints).serialize());
            } else if(Types.isWeapon(item.kind)) {
                this.equipWeapon(item.kind);
            }
        }
    },
    
    updateHitPoints: function() {
        this.resetHitPoints(Formulas.hp(this.armorLevel));
    },
    
    updatePosition: function() {
        if(this.requestpos_callback) {
            var pos = this.requestpos_callback();
            this.setPosition(pos.x, pos.y);
        }
    },
    
    onRequestPosition: function(callback) {
        this.requestpos_callback = callback;
    },
    
    resetTimeout: function() {
        clearTimeout(this.disconnectTimeout);
        this.disconnectTimeout = setTimeout(this.timeout.bind(this), 1000 * 60 * 15); // 15 min.
    },
    
    timeout: function() {
        this.connection.sendUTF8("timeout");
        this.connection.close("Player was idle for too long");
    },

    // ------- Phase 4: optional persistence -------

    // Resolve the player's token (minting a fresh one if needed), fence the
    // session against duplicate logins, and hydrate persisted state. Treats all
    // stored data as untrusted. Returns true if prior state was restored.
    loadPersistedState: function(presentedToken) {
        this.hasRestoredPosition = false;

        if(!this.store) {
            return false;
        }

        // A presented token is a bearer key: always reuse it (so a reconnecting
        // client keeps the same token and the session registry can fence it,
        // even before any state has been saved for it). New players get a fresh
        // minted token. State is restored only if a stored row exists.
        var token = presentedToken || PlayerStore.mintToken();
        this.token = token;

        // Session fencing: supersede any live session holding the same token so
        // two sessions can't run (and later clobber each other's saved state).
        if(this.sessions) {
            var acquired = this.sessions.acquire(token, this);
            this.session = acquired.sessionId;
            if(acquired.previous && acquired.previous !== this) {
                acquired.previous.supersede();
            }
        }

        var row = null;
        if(presentedToken) {
            try {
                row = this.store.load(token);
            } catch(e) {
                log.error("PlayerStore load failed: " + e);
                row = null;
            }
        }

        if(!row) {
            return false;
        }

        var name = Utils.sanitize(String(row.name === undefined || row.name === null ? "" : row.name));
        if(name !== "") {
            this.name = name.substr(0, 15);
        }
        if(Types.isArmor(row.armor)) {
            this.equipArmor(row.armor);
        }
        if(Types.isWeapon(row.weapon)) {
            this.equipWeapon(row.weapon);
        }
        if(this.isValidOrientation(row.orientation)) {
            this.orientation = row.orientation;
        }
        if(row.checkpointId !== null && row.checkpointId !== undefined) {
            var checkpoint = this.server.map.getCheckpoint(row.checkpointId);
            if(checkpoint) {
                this.lastCheckpoint = checkpoint;
            }
        }
        if(typeof row.x === 'number' && typeof row.y === 'number' && this.server.isValidPosition(row.x, row.y)) {
            this.setPosition(row.x, row.y);
            this.hasRestoredPosition = true;
        }
        return true;
    },

    isValidOrientation: function(o) {
        return o === Types.Orientations.UP || o === Types.Orientations.DOWN
            || o === Types.Orientations.LEFT || o === Types.Orientations.RIGHT;
    },

    // Persist current state. No-op when persistence is off or when this session
    // has been superseded (so a stale session can't roll back newer progress).
    savePersistedState: function() {
        if(!this.store || !this.token) {
            return;
        }
        if(this.sessions && !this.sessions.isCurrent(this.token, this.session)) {
            return;
        }
        var state = {
            name: this.name,
            armor: this.armor,
            weapon: this.weapon,
            x: this.x,
            y: this.y,
            orientation: this.orientation,
            checkpointId: this.lastCheckpoint ? this.lastCheckpoint.id : null
        };
        try {
            this.store.save(this.token, state);
        } catch(e) {
            log.error("PlayerStore save failed: " + e);
        }
    },

    // Throttled save for high-frequency events (movement): a save is scheduled
    // only when none is already pending, coalescing writes so they never run on
    // the per-tick hot path.
    scheduleSave: function() {
        var self = this;
        if(!this.store || !this.token || this.saveTimeout) {
            return;
        }
        this.saveTimeout = setTimeout(function() {
            self.saveTimeout = null;
            self.savePersistedState();
        }, 5000);
    },

    // Called on the previous holder of a token when a newer session takes over.
    supersede: function() {
        this.isSuperseded = true;
        clearTimeout(this.saveTimeout);
        try {
            this.connection.close("Replaced by a newer session for the same token");
        } catch(e) {
            /* connection may already be closing */
        }
    }
});