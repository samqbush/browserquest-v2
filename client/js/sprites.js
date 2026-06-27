import _ from 'underscore';

// Eagerly import every sprite definition JSON. Replaces the legacy RequireJS
// `text!` plugin that listed each file explicitly. Vite resolves the glob at
// build time; each module's default export is the parsed JSON object.
var spriteModules = import.meta.glob('../sprites/*.json', {
    eager: true,
    import: 'default',
});

var sprites = {};

_.each(spriteModules, function(sprite) {
    if (sprite && sprite.id) {
        sprites[sprite.id] = sprite;
    }
});

export default sprites;
