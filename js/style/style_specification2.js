'use strict';

var reference = require('mapbox-gl-style-spec/reference/latest');

// TODO combine with reference

module.exports = {

    getPaintLayer: function(type) {
        return reference['paint_' + type];
    },

    getLayoutLayer: function(type) {
        return reference['layout_' + type];
    },

    getPaintProperty: function(type, name) {
        return this.getPaintLayer(type)[name];
    },

    getLayoutProperty: function(type, name) {
        return this.getLayoutLayer(type)[name];
    }

};
