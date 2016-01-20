'use strict';

var StyleSpecification = require('./style_specification2');
var StyleValue = require('./style_value');
var assert = require('assert');
var util = require('../util/util');

// TODO animation loop stuff
// TODO support style classes
// TODO restore premultiply functionality
// TODO standardize on style spec class
// TODO restore line dash scaling
// TODO shore up domain terminology ("StyleValue -> StyleDeclaration"?)
// TODO support disabled transitions
// TODO combine paint and layout properties

function Layer(options) {
    this.layer = options.layer;
    this.transitionOptions = options.transitionOptions;

    this.refLayer = Layer.create({
        layer: options.refLayer,
        transitionOptions: this.transitionOptions
    });

    this.id = this.layer.id;
    this.type = this.layer.type || 'raster';

    var property;
    this.paintValues = {};
    for (property in StyleSpecification.getPaintLayer(this.type)) {
        this.setPaintProperty(property, this.layer.paint && this.layer.paint[property]);
    }

    if (!this.refLayer) {
        this.source = this.layer.source;
        this.sourceLayer = this.layer['source-layer'];
        this.filter = this.layer.filter;
        this.minzoom = this.layer.minzoom;
        this.maxzoom = this.layer.maxzoom;

        this.layoutValues = {};
        for (property in StyleSpecification.getLayoutLayer(this.type)) {
            this.setLayoutProperty(property, this.layer.layout && this.layer.layout[property]);
        }
    } else {
        this.source = this.refLayer.source;
        this.sourceLayer = this.refLayer['source-layer'];
        this.filter = this.refLayer.filter;
        this.minzoom = this.refLayer.minzoom;
        this.maxzoom = this.refLayer.maxzoom;
    }
}

Layer.create = function(options) {
    if (!options || !options.layer) {
        return null;
    } else if (options instanceof Layer) {
        return options;
    } else {
        var Class;
        if (options.layer.type === 'symbol') {
            Class = require('./symbol_style_layer');
        } else {
            Class = Layer;
        }
        return new Class(options);
    }
};

// TODO support options and animationLoop params
Layer.prototype.setClasses = function(klasses) {
    var properties = {};
    for (var klass in klasses) {
        util.extend(properties, this.layer['paint.' + klass]);
    }
    for (var property in properties) {
        this.setPaintProperty(property, properties[property]);
    }
}

Layer.prototype.serialize = function() {
    return {
        layer: this.layer,
        refLayer: this.refLayer && this.refLayer.serialize(),
        transitionOptions: this.transitionOptions
    };
};

Layer.prototype.getPaintProperties = function(state) {
    var output = {};
    for (var name in this.paintValues) {
        output[name] = this.getPaintProperty(name, state);
    }
    return output;
};

Layer.prototype.getPaintProperty = function(property, state) {
    var value = this.paintValues[property];

    if (!value) {
        console.warn('Could not find value for ' + property);
        return null;

    } else if (value.type === 'color') {
        var color = value.get(state);
        if (!color) return null;

        var opacityValue = this.paintValues[this.type + '-opacity'];
        var opacity = opacityValue ? opacityValue.get(state) : 1;

        return util.premultiply([color[0], color[1], color[2], color[3] * opacity]);

    } else {
        return value.get(state);
    }
};

Layer.prototype.setPaintProperty = function(property, value) {
    this.paintValues[property] = new StyleValue(
        StyleSpecification.getPaintProperty(this.type, property),
        value,
        this.paintValues[property],
        this.transitionOptions
    );
};

Layer.prototype.getLayoutProperties = function(state) {
    var output = {};
    for (var name in this.layoutValues) {
        output[name] = this.getLayoutProperty(name, state);
    }
    return output;
};

Layer.prototype.getLayoutProperty = function(property, state) {
    if (this.refLayer) {
        this.refLayer.getLayoutProperty(property, state);
    } else {
        var value = this.layoutValues[property];
        if (!value) console.warn('Could not find value for ' + property);
        return value && value.get(state);
    }
};

Layer.prototype.setLayoutProperty = function(property, value) {
    if (this.refLayer) {
        assert(false);
    } else {
        this.layoutValues[property] = new StyleValue(
            StyleSpecification.getLayoutProperty(this.type, property),
            value,
            this.layoutValues[property],
            this.transitionOptions
        );
    }
};

Layer.prototype.isHidden = function(state) {
    var zoom = state.zoom;

    if (this.getLayoutProperty('visibility', state) === 'none') return true;

    if (this.maxzoom && zoom >= this.maxzoom) return true;
    if (this.minzoom && zoom < this.minzoom) return true;

    if (this.type !== 'symbol') {
        var opacityKey = this.type + '-opacity';
        if (this.getPaintProperty(opacityKey, state) === 0) return true;
    }

    return false;
};

Layer.prototype.getFilter = function () {
    return this.filter;
};

Layer.prototype.setFilter = function (filter) {
    this.filter = filter;
};

Layer.prototype.setLayerZoomRange = function(minzoom, maxzoom) {
    this.minzoom = minzoom;
    this.maxzoom = maxzoom;
};

// TO BE DEPRECATED, replaced with serialization / unserialization
Layer.prototype.getJSON = function(state) {
    return util.extend({}, this.json, {
        paint: this.getPaintProperties(state),
        layout: this.getLayoutProperties(state)
    });
};

module.exports = Layer;
