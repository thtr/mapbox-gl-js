'use strict';

var ElementGroups = require('./elementgroups.js');
var Anchor = require('./anchor.js');
var interpolate = require('./interpolate.js');
var Point = require('point-geometry');
var resolveTokens = require('../util/token.js');
var Placement = require('../text/placement.js');
var Shaping = require('../text/shaping.js');
var resolveText = require('../text/resolvetext.js');

module.exports = SymbolBucket;

var fullRange = [2 * Math.PI , 0];

function SymbolBucket(info, buffers, collisionGroup, elementGroups) {
    this.info = info;
    this.buffers = buffers;

    this.blocks = collisionGroup && collisionGroup.group(info['symbol-placement-blocks'] || ['default']);
    this.blockedBy = collisionGroup && collisionGroup.group(info['symbol-placement-blocked-by'] || ['default']);
    this.collisionGroup = collisionGroup;

    if (info['symbol-placement'] === 'line') {
        if (!info.hasOwnProperty('text-rotation-alignment')) {
            info['text-rotation-alignment'] = 'map';
        }
        if (!info.hasOwnProperty('icon-rotation-alignment')) {
            info['icon-rotation-alignment'] = 'map';
        }
    }

    if (elementGroups) {
        this.elementGroups = elementGroups;
    } else {
        this.elementGroups = {
            text: new ElementGroups(buffers.glyphVertex),
            icon: new ElementGroups(buffers.iconVertex)
        };
    }
}

SymbolBucket.prototype.addFeatures = function() {
    var info = this.info;
    var features = this.features;
    var textFeatures = this.textFeatures;

    var horizontalAlign = 0.5;
    if (info['text-horizontal-align'] === 'right') horizontalAlign = 1;
    else if (info['text-horizontal-align'] === 'left') horizontalAlign = 0;

    var verticalAlign = 0.5;
    if (info['text-vertical-align'] === 'bottom') verticalAlign = 1;
    else if (info['text-vertical-align'] === 'top') verticalAlign = 0;

    var justify = 0.5;
    if (info['text-justify'] === 'right') justify = 1;
    else if (info['text-justify'] === 'left') justify = 0;

    var oneEm = 24;
    var lineHeight = info['text-line-height'] * oneEm;
    var maxWidth = info['symbol-placement'] !== 'line' && info['text-max-width'] * oneEm;
    var spacing = info['text-letter-spacing'] * oneEm;
    var fontstack = info['text-font'];
    var textOffset = [info['text-offset'][0] * oneEm, info['text-offset'][1] * oneEm];

    var sort = info['symbol-sort'];
    if (sort) {
        var field = sort.field;
        var order = sort.order;
        features.sort(function(a, b) {
            var propA = a.properties[field];
            var indexA = order.indexOf(propA);
            if (indexA < 0) indexA = Infinity;
            var propB = b.properties[field];
            var indexB = order.indexOf(propB);
            if (indexB < 0) indexB = Infinity;
            var diff = indexA - indexB;
            if (!diff) {
                return propA < propB;
            } else {
                return diff;
            }
        });
    }

    for (var k = 0; k < features.length; k++) {

        var feature = features[k];
        var text = textFeatures[k];
        var lines = feature.loadGeometry();

        var shaping = false;
        if (text) {
            shaping = Shaping.shape(text, fontstack, this.stacks, maxWidth,
                    lineHeight, horizontalAlign, verticalAlign, justify, spacing, textOffset);
        }

        var image = false;
        if (this.sprite && this.info['icon-image']) {
            image = this.sprite[resolveTokens(feature.properties, info['icon-image'])];

            if (image) {
                // match glyph tex object. TODO change
                image.w = image.width;
                image.h = image.height;

                if (image.sdf) this.elementGroups.sdfIcons = true;
            }
        }

        if (!shaping && !image) continue;
        this.addFeature(lines, this.stacks, shaping, image);
    }
};

function byScale(a, b) {
    return a.scale - b.scale;
}

SymbolBucket.prototype.addFeature = function(lines, faces, shaping, image) {
    var info = this.info;
    var collisionGroup = this.collisionGroup;
    var blockedBy = this.blockedBy;
    var blocks = this.blocks;

    var minScale = 0.5;
    var glyphSize = 24;

    var horizontalText = info['text-rotation-alignment'] === 'viewport',
        horizontalIcon = info['icon-rotation-alignment'] === 'viewport',
        fontScale = info['text-max-size'] / glyphSize,
        textBoxScale = collisionGroup.tilePixelRatio * fontScale,
        iconBoxScale = collisionGroup.tilePixelRatio * info['icon-max-size'],
        iconWithoutText = info['text-optional'] || !shaping,
        textWithoutIcon = info['icon-optional'] || !image;

    for (var i = 0; i < lines.length; i++) {

        var line = lines[i];
        var anchors;

        if (info['symbol-placement'] === 'line') {
            // Line labels
            anchors = interpolate(line, info['symbol-min-distance'], minScale, collisionGroup.maxPlacementScale, collisionGroup.tilePixelRatio);

            // Sort anchors by segment so that we can start placement with the
            // anchors that can be shown at the lowest zoom levels.
            anchors.sort(byScale);

        } else {
            // Point labels
            anchors = [new Anchor(line[0].x, line[0].y, 0, minScale)];
        }


        // TODO: figure out correct ascender height.
        var origin = new Point(0, -17);

        for (var j = 0, len = anchors.length; j < len; j++) {
            var anchor = anchors[j];


            // Calculate the scales at which the text and icons can be first shown without overlap
            var glyph;
            var icon;
            var glyphScale = null;
            var iconScale = null;
            var nextScale = null;
            var nextRange = null;
            var k;

            if (shaping) {
                glyph = Placement.getGlyphs(anchor, origin, shaping, faces, textBoxScale, horizontalText, line, info);
                glyphScale = blockedBy.length ? false : glyph.minScale;
                for (k = 0, nextScale; k < blockedBy.length; k++) {
                    nextScale = blockedBy[k].getPlacementScale(glyph.boxes, glyph.minScale);
                    if (!nextScale) {
                        glyphScale = nextScale;
                        break;
                    } else {
                        glyphScale = Math.max(glyphScale, nextScale);
                    }
                }
                if (!glyphScale && !iconWithoutText) continue;
            }

            if (image) {
                icon = Placement.getIcon(anchor, image, iconBoxScale, line, info);
                iconScale = blockedBy.length ? false : icon.minScale;
                for (k = 0, nextScale; k < blockedBy.length; k++) {
                    nextScale = blockedBy[k].getPlacementScale(icon.boxes, icon.minScale);
                    if (!nextScale) {
                        iconScale = nextScale;
                        break;
                    } else {
                        iconScale = Math.max(iconScale, nextScale);
                    }
                }
                if (!iconScale && !textWithoutIcon) continue;
            }

            if (!iconWithoutText && !textWithoutIcon) {
                iconScale = glyphScale = Math.max(iconScale, glyphScale);
            } else if (!textWithoutIcon && glyphScale) {
                glyphScale = Math.max(iconScale, glyphScale);
            } else if (!iconWithoutText && iconScale) {
                iconScale = Math.max(iconScale, glyphScale);
            }

            // Get the rotation ranges it is safe to show the glyphs
            var glyphRange;
            if (!glyphScale || !blockedBy.length) {
                glyphRange = fullRange;
            } else {
                for (k = 0; k < blockedBy.length; k++) {
                    nextRange = blockedBy[k].getPlacementRange(glyph.boxes, glyphScale, horizontalText);
                    glyphRange = glyphRange || nextRange;
                    glyphRange[0] = Math.max(glyphRange[0], nextRange[0]);
                    glyphRange[1] = Math.min(glyphRange[1], nextRange[1]);
                }
            }
            var iconRange;
            if (!iconScale || !blockedBy.length) {
                iconRange = fullRange;
            } else {
                for (k = 0; k < blockedBy.length; k++) {
                    nextRange = blockedBy[k].getPlacementRange(icon.boxes, iconScale, horizontalIcon);
                    iconRange = iconRange || nextRange;
                    iconRange[0] = Math.max(iconRange[0], nextRange[0]);
                    iconRange[1] = Math.min(iconRange[1], nextRange[1]);
                }
            }

            var maxRange = [
                Math.min(iconRange[0], glyphRange[0]),
                Math.max(iconRange[1], glyphRange[1])];

            if (!iconWithoutText && !textWithoutIcon) {
                iconRange = glyphRange = maxRange;
            } else if (!textWithoutIcon) {
                glyphRange = maxRange;
            } else if (!iconWithoutText) {
                iconRange = maxRange;
            }

            // Insert final placement into collision tree and add glyphs/icons to buffers
            if (glyphScale) {
                for (k = 0; k < blocks.length; k++) {
                    blocks[k].insert(glyph.boxes, anchor, glyphScale, glyphRange, horizontalText);
                }
                this.addSymbols(this.buffers.glyphVertex, this.elementGroups.text, glyph.shapes, glyphScale, glyphRange);
            }

            if (iconScale) {
                for (k = 0; k < blocks.length; k++) {
                    blocks[k].insert(icon.boxes, anchor, iconScale, iconRange, horizontalIcon);
                }
                this.addSymbols(this.buffers.iconVertex, this.elementGroups.icon, icon.shapes, iconScale, iconRange);
            }

        }
    }
};

SymbolBucket.prototype.addSymbols = function(buffer, elementGroups, symbols, scale, placementRange) {

    var zoom = this.collisionGroup.zoom;

    elementGroups.makeRoomFor(0);
    var elementGroup = elementGroups.current;

    var placementZoom = Math.log(scale) / Math.LN2 + zoom;

    for (var k = 0; k < symbols.length; k++) {

        var symbol = symbols[k],
            tl = symbol.tl,
            tr = symbol.tr,
            bl = symbol.bl,
            br = symbol.br,
            tex = symbol.tex,
            angle = symbol.angle,
            anchor = symbol.anchor,


            minZoom = Math.max(zoom + Math.log(symbol.minScale) / Math.LN2, placementZoom),
            maxZoom = Math.min(zoom + Math.log(symbol.maxScale) / Math.LN2, 25);

        if (maxZoom <= minZoom) continue;

        // Lower min zoom so that while fading out the label it can be shown outside of collision-free zoom levels
        if (minZoom === placementZoom) minZoom = 0;

        // first triangle
        buffer.add(anchor.x, anchor.y, tl.x, tl.y, tex.x, tex.y, angle, minZoom, placementRange, maxZoom, placementZoom);
        buffer.add(anchor.x, anchor.y, tr.x, tr.y, tex.x + tex.w, tex.y, angle, minZoom, placementRange, maxZoom, placementZoom);
        buffer.add(anchor.x, anchor.y, bl.x, bl.y, tex.x, tex.y + tex.h, angle, minZoom, placementRange, maxZoom, placementZoom);

        // second triangle
        buffer.add(anchor.x, anchor.y, tr.x, tr.y, tex.x + tex.w, tex.y, angle, minZoom, placementRange, maxZoom, placementZoom);
        buffer.add(anchor.x, anchor.y, bl.x, bl.y, tex.x, tex.y + tex.h, angle, minZoom, placementRange, maxZoom, placementZoom);
        buffer.add(anchor.x, anchor.y, br.x, br.y, tex.x + tex.w, tex.y + tex.h, angle, minZoom, placementRange, maxZoom, placementZoom);

        elementGroup.vertexLength += 6;
    }

};

SymbolBucket.prototype.getDependencies = function(tile, actor, callback) {
    var firstdone = false;
    var firsterr;
    this.getTextDependencies(tile, actor, done);
    this.getIconDependencies(tile, actor, done);
    function done(err) {
        if (err || firstdone) callback(err);
        firstdone = true;
        firsterr = err;
    }
};

SymbolBucket.prototype.getIconDependencies = function(tile, actor, callback) {
    var bucket = this;
    if (this.info['icon-image']) {
        if (SymbolBucket.sprite) {
            this.sprite = SymbolBucket.sprite;
            callback();
        } else {
            actor.send('get sprite json', {}, function(err, data) {
                SymbolBucket.sprite = bucket.sprite = data.sprite;
                callback(err);
            });
        }
    } else {
        callback();
    }
};

SymbolBucket.prototype.getTextDependencies = function(tile, actor, callback) {
    var features = this.features;
    var info = this.info;

    if (tile.stacks === undefined) tile.stacks = {};
    var stacks = this.stacks = tile.stacks;
    var fontstack = info['text-font'];
    if (stacks[fontstack] === undefined) {
        stacks[fontstack] = { glyphs: {}, rects: {} };
    }
    var stack = stacks[fontstack];

    var data = resolveText(features, info, stack.glyphs);
    this.textFeatures = data.textFeatures;

    actor.send('get glyphs', {
        id: tile.id,
        fontstack: fontstack,
        codepoints: data.codepoints
    }, function(err, newstack) {
        if (err) return callback(err);

        var newglyphs = newstack.glyphs;
        var newrects = newstack.rects;
        var glyphs = stack.glyphs;
        var rects = stack.rects;

        for (var codepoint in newglyphs) {
            glyphs[codepoint] = newglyphs[codepoint];
            rects[codepoint] = newrects[codepoint];
        }

        callback();
    });
};

SymbolBucket.prototype.hasData = function() {
    return !!this.elementGroups.text.current || !!this.elementGroups.icon.current;
};
