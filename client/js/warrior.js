import Player from './player.js';
import Types from 'shared/js/gametypes.js';

    
    var Warrior = Player.extend({
        init: function(id, name) {
            this._super(id, name, Types.Entities.WARRIOR);
        },
    });
    
export default Warrior;

