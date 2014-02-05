'use strict';

var Tile = require('./tile.js');
var Transform = require('./transform.js');
var Geometry = require('../geometry/geometry.js');
var FeatureTree = require('../geometry/featuretree.js');
var util = require('../util/util.js');
var Bucket = require('../geometry/bucket.js');

module.exports = GeoJSONTile;

function GeoJSONTile(map, features, zoom) {
    this.map = map;
    this.features = features;

    this.geometry = new Geometry();
    this.featureTree = new FeatureTree(getGeometry, getType);

}

function getGeometry(feature) {
    return feature.coords;
}

function getType(feature) {
    return feature.type;
}

GeoJSONTile.prototype = Object.create(Tile.prototype);

GeoJSONTile.prototype.sortFeaturesIntoBuckets = function(features) {
    var mapping = this.map.style.stylesheet.buckets;

    var buckets = {};

    for (var name in mapping) {
        if (mapping[name].datasource === 'geojson') {
            buckets[name] = new Bucket(mapping[name], this.geometry);
            buckets[name].features = [];
        }
    }

    for (var i = 0; i < this.features.length; i++) {
        var feature = this.features[i];
        for (var key in buckets) {

            if (!buckets[key].compare || buckets[key].compare(feature.properties)) {

                var type = mapping[key].feature_type || mapping[key].type;
                if (type === feature.type) {
                    buckets[key].features.push(feature);
                }
            }
        }
    }

    return buckets;
};

GeoJSONTile.prototype._parse = function(features) {
    this.layers = {};

    var buckets = this.sortFeaturesIntoBuckets(this.features);

    for (var name in buckets) {

        var bucket = buckets[name];
        if (!bucket.features.length) continue;

        bucket.start();

        for (var i = 0; i < bucket.features.length; i++) {
            var feature = bucket.features[i];

            bucket.addFeature(feature.coords);

            var bbox = getbbox(feature.coords);
            this.featureTree.insert(bbox, name, feature);
        }

        bucket.end();

        this.layers[name] = bucket.indices;
    } 


};

GeoJSONTile.prototype._load = function() {
    if (this.loaded) return;
    this._parse(this.features);
    this.loaded = true;
};

// noops
GeoJSONTile.prototype.abort = function() { };
GeoJSONTile.prototype.remove = function() { };

GeoJSONTile.prototype.featuresAt = function(pos, params, callback) {
    this.featureTree.query({
        id: this.id,
        x: pos.x,
        y: pos.y,
        scale: pos.scale,
        params: params
    }, callback);
};

function getbbox(rings) {
    var x1 = Infinity,
        x2 = -Infinity,
        y1 = Infinity,
        y2 = -Infinity;

    for (var i = 0; i < rings.length; i++) {
        var ring = rings[i];

        for (var j = 0; j < ring.length; j++) {
            var coord = ring[j];

            x1 = Math.min(x1, coord.x);
            x2 = Math.max(x2, coord.x);
            y1 = Math.min(y1, coord.y);
            y2 = Math.max(y2, coord.y);
        }
    }

    return { x1: x1, y1: y1, x2: x2, y2: y2 };
}