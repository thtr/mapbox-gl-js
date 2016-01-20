'use strict';

var Layer = require('../style_layer');
var util = require('../../util/util');

function SymbolLayer() {
    return Layer.apply(this, arguments);
}

SymbolLayer.prototype = util.inherit(Layer, {});

SymbolLayer.prototype.isHidden = function(state) {
    var isTextHidden = (
        this.getPaintProperty('text-opacity', state) === 0 ||
        !this.getLayoutProperty('text-field', state)
    );

    var isIconHidden = (
        this.getPaintProperty('icon-opacity', state) === 0 ||
        !this.getLayoutProperty('icon-image', state)
    );

    return (isTextHidden && isIconHidden) || Layer.prototype.isHidden.call(this, state);
};

module.exports = SymbolLayer;
