'use strict';

var Actor = require('../actor');
var WebWorkify = require('webworkify');

module.exports = Dispatcher;

// this exists in the Window context
function Dispatcher(length, parent) {
// window here
    this.actors = [];
    this.currentActor = 0;
    for (var i = 0; i < length; i++) {
        var worker = new WebWorkify(require('../../source/worker'));
        var actor = new Actor(worker, parent);
        actor.name = "Worker " + i;
        this.actors.push(actor);
    }
}

Dispatcher.prototype = {
    broadcast: function(type, data) {
//console.log('>>broadcast>',type);
        for (var i = 0; i < this.actors.length; i++) {
            this.actors[i].send(type, data);
        }
    },

    send: function(type, data, callback, targetID, buffers) {
        if (typeof targetID !== 'number' || isNaN(targetID)) {
            // Use round robin to send requests to web workers.
            targetID = this.currentActor = (this.currentActor + 1) % this.actors.length;
        }

        this.actors[targetID].send(type, data, callback, buffers);
        return targetID;
    },

    remove: function() {
        for (var i = 0; i < this.actors.length; i++) {
            this.actors[i].target.terminate();
        }
        this.actors = [];
    }
};
