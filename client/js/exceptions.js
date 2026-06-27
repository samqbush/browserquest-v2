import Class from './lib/class.js';

    
    var Exceptions = {
        
        LootException: Class.extend({
            init: function(message) {
                this.message = message;
            }
        })
    };
    
export default Exceptions;

