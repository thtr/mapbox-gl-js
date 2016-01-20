'use strict';

var parseColor = require('./parse_color');
var interpolate = require('../util/interpolate');
var MapboxGLFunction = require('mapbox-gl-function');
var util = require('../util/util');

function StyleValue(specification, value, previousValue, transitionOptions) {
    this.specification = specification;
    this.type = specification.type;
    this.time = getTime();
    this.previousValue = previousValue;
    this.value = value;

    this.transitionDuration = transitionOptions.duration;
    this.transitionDelay = transitionOptions.delay;
    if (!this.previousValue && this.specification.function === 'interpolated') {
        this.transitionStartTime = this.time + this.transitionDelay;
        this.transitionEndTime = this.transitionStartTime + this.transitionDuration;
    } else {
        this.transitionStartTime = this.transitionEndTime = this.time;
    }
}

StyleValue.prototype.getUntransitioned = function(options) {
    var zoom = options.zoom;
    var zoomHistory = options.zoomHistory;
    var duration = options.duration;

    var value = this.value;
    if (!value) value = this.specification.default;
    if (this.type === 'color') value = parseColor(value);

    var calculate;
    if (!this.isZoomDependent()) {
        calculate = function() { return value; };
    } else {
        calculate = MapboxGLFunction[this.specification.function](value);
    }

    if (this.specification.function === 'piecewise-constant' && this.specification.transition) {
        var zoomFraction = zoom % 1;
        var t = Math.min((Date.now() - zoomHistory.lastIntegerZoomTime) / duration, 1);

        if (!value) {
            return null;

        } else if (zoom > zoomHistory.lastIntegerZoom) {
            return {
                from: calculate(zoom - 1),
                fromScale: 2,
                to: calculate(zoom),
                toScale: 1,
                t: zoomFraction + (1 - zoomFraction) * t
            };
        } else {
            return {
                from: calculate(zoom + 1),
                fromScale: 0.5,
                to: calculate(zoom),
                toScale: 1,
                t: 1 - (1 - t) * zoomFraction
            };
        }

    } else {
        return calculate(zoom);
    }
};

StyleValue.prototype.get = function(options) {
    var zoom = options.zoom;
    var zoomHistory = options.zoomHistory;
    var time = options.time;

    var valueTo = this.getUntransitioned({zoom: zoom, zoomHistory: zoomHistory, duration: this.transitionDuration});

    if (!this.isTransitioning(time)) {
        return valueTo;

    } else {
        var valueFrom = this.previousValue.get(zoom, zoomHistory, this.transitionStartTime);
        var eased = (time - this.transitionStartTime) / this.transitionDuration;

        if ((this.type === 'string' || this.type === 'array') && this.specification.transition) {
            return {
                from: valueFrom.to,
                fromScale: valueFrom.toScale,
                to: valueTo.to,
                toScale: valueTo.toScale,
                t: eased
            };
        } else {
            return interpolate[this.type](valueFrom, valueTo, util.easeCubicInOut(eased));
        }
    }
};

StyleValue.prototype.isZoomDependent = function() {
    return !!(this.value && this.value.stops);
};

StyleValue.prototype.isTransitioning = function(time) {
    return this.previousValue && (time || getTime()) < this.transitionEndTime;
};

function getTime() {
    return new Date().getTime();
}

module.exports = StyleValue;
