
var Utils = {},
    xss = require('xss'),
    Types = require("../../shared/js/gametypes");

module.exports = Utils;

// Neutralize all HTML by escaping tags to inert entities (empty whitelist) and
// dropping the contents of dangerous tags. The client renders chat/names via
// jQuery `.html()` (client/js/bubble.js), so output must never be interpretable
// as markup. Escaping (rather than stripping) preserves legitimate text such as
// "<3" or "a < b".
var xssFilter = new xss.FilterXSS({
    whiteList: {},
    stripIgnoreTagBody: ['script', 'style'],
});

Utils.sanitize = function(string) {
    return xssFilter.process(string);
};

Utils.random = function(range) {
    return Math.floor(Math.random() * range);
};

Utils.randomRange = function(min, max) {
    return min + (Math.random() * (max - min));
};

Utils.randomInt = function(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
};

Utils.clamp = function(min, max, value) {
    if(value < min) {
        return min;
    } else if(value > max) {
        return max;
    } else {
        return value;
    }
};

Utils.randomOrientation = function() {
    var o, r = Utils.random(4);
    
    if(r === 0)
        o = Types.Orientations.LEFT;
    if(r === 1)
        o = Types.Orientations.RIGHT;
    if(r === 2)
        o = Types.Orientations.UP;
    if(r === 3)
        o = Types.Orientations.DOWN;
    
    return o;
};

Utils.Mixin = function(target, source) {
  if (source) {
    for (var key, keys = Object.keys(source), l = keys.length; l--; ) {
      key = keys[l];

      if (source.hasOwnProperty(key)) {
        target[key] = source[key];
      }
    }
  }
  return target;
};

Utils.distanceTo = function(x, y, x2, y2) {
    var distX = Math.abs(x - x2);
    var distY = Math.abs(y - y2);

    return (distX > distY) ? distX : distY;
};