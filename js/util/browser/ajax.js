'use strict';
exports.getPath = function(url, type){
	function getExtension(path, ext){
		return (!/\.[a-zA-Z0-9]+$/.test(path)) ? (path + ext) : path;
	};
/*
'file:///Users/<user>/Library/Developer/CoreSimulator/Devices/<id>/data/Containers/Data/Application/<id>/Library/NoCloud/'
'cdvfile://localhost/library-nosync/';
(location.origin||'') + location.pathname.replace(/[^\/]+$/,'');

		// from '<full url like http://domain/path/to/file?asdf#asdf?blah>' return 'path/to/file'
		// '/ping' or 'file://...usr/ping' or 'stuff/usr/ping' return 'ping'
		http://domain/path/to/file
		file://...root.../usr/<category>/< path_to_file || path/to/file >

		/usr/asset/*.json etc
		/usr/tile/z/x/y.pbf

		v4/mapbox.mapbox-terrain-v2,mapbox.mapbox-streets-v6/12/655/1582.vector.pbf <from> http://b.tiles.mapbox.com/v4/mapbox.mapbox-terrain-v2,mapbox.mapbox-streets-v6/12/655/1582.vector.pbf
		get /z/x/y.ext (or .something.pbf eg /1/2/3.vector.pbf)
*/
	this.getPath = (function _getPath(url, type){
		var path, tile;
		if(!/^http/i.test(url)){
		// ./something
		// something
		// file....
		// local/relative urls pass-thru to same-domain+protocol 
		// either file calls like file://.../something/intented/to/be/local
		// or http://localhost...
			return location.origin + location.pathname.replace(/[^\/]+$/,'') + url.replace(/^[\.\/]+/,'');
		};
		path = url.replace(/^https?:\/\/[^\/]+\/([^?#]+).*$/,'$1');
		if(tile = path.match(/^.*\/([0-9]+\/[0-9]+\/[0-9]+[.a-z0-9_-]+)/i)){
			path = 'tile/'+tile[1];
		}else{
			path = 'asset/' + path.replace(/[^a-zA-Z0-9_.-]+/g, '_');
		};

		return getExtension( self.basepath + 'usr/' + path, '.'+(type || 'file'));
	}).bind(this);
	return this.getPath(url, type);
};
self.basepath = '';
self.resolveLocalFileSystemURL = self.resolveLocalFileSystemURL || self.webkitResolveLocalFileSystemURL || false;
self.requestFileSystem = self.requestFileSystem || self.webkitRequestFileSystem || false;
self.requestFileSystemSync = self.requestFileSystemSync || self.webkitRequestFileSystemSync || false;

exports.cleanup = function(path){
// TODO
// no path argument, or a falsy one, will remove everything in usr/ clearing ALL ITEMS
	var path = exports.getPath(path);
	return new Promise(function(resolve, reject){
		resolveLocalFileSystemURL(path, function(base){
			base.removeRecursively(resolve, reject);
		}, reject);
	});
};
exports.saveFile = function(path, data, mimetype){
	var part = path.match(/^(.*\/)([^\/]+)$/);
	function save(dirEntry){
		dirEntry.getFile(part[2], {create:true}, function(fileEntry){
			fileEntry.createWriter(function(writer){
				var isJSON = /json/i, output, blob, type = mimetype || '';

				if( isJSON.test(type) ){
					try{
						data = JSON.stringify( data );
					}catch(err){ };
				};
				blob = new Blob([ data ], {type: type});
				if(blob.size < 1) return;

				writer.write( blob );
			});
		});
	};
// TODO
// cordova throws here in workers b/c there's no self.resolveLocalFileSystemURL
	if(!self.resolveLocalFileSystemURL){
		postMessage({type:'saveFile', path: path, data:data, mimetype: mimetype}, [data]);
		return;
	};
// TODO
	resolveLocalFileSystemURL(part[1], function(dir){
		save(dir);
	}, function(err){
		exports.mkdir(part[1], save);
	});
};
exports.mkdir = function(path, complete){
	var root;
	function mkdir(parent, dirs, i, complete){
		parent.getDirectory(dirs[i], {create:true}, function(dirEntry){
			if(dirs[++i]) mkdir(dirEntry, dirs, i, complete);
			else if(complete) complete(dirEntry);
		});
	};
	resolveLocalFileSystemURL(basepath, function(fs){
		// file.....exists/path/to/file => [path, to]
		root = fs;
		exports.mkdir = function(path, complete){
			var dirs = path.replace(basepath, '').replace(/\/[^\/]*$/,'').split('/');
			mkdir(root, dirs, 0, complete);
		};
	});
};
exports.getFile = function(path, callback, type){
	var root = false;
	exports.getFile = self.requestFileSystem ? (
	// branch here based on worker,sync/window,async
	function useFS(path, callback, type){
	// most of this occurs in a worker, at least until cordova FS APIs work
		resolveLocalFileSystemURL(path, function(fs){
			if(callback.abort) return;
			fs.file(function(file){
				var reader = new FileReader();
				//reader._file = file;
				reader.onloadend = function(){
					var output;
					try{
						output = type === 'json' ? JSON.parse(this.result) : this.result;
					}catch(err){
						return callback(err);
					};
					callback(false, output);
				};
				reader.onerror = callback;
				reader[type === 'json' ? 'readAsText':'readAsArrayBuffer'](file);
			});
		}, function(err){
			// create the directories so when it comes in, we can save it here
			try{
				exports.mkdir(path);
			}catch(err){ };
			callback(err);
		});
	}) : function noFS(path, callback, type){
// TODO WKWebView NOTE handle this in the actual event handler, search for the LIstener('message' and WKWebView
// TODO TODO TODO WKWebView NOTE FIXME
//		postMessage({type:'getFile', msg: self.MessageChannel, prt: self.MessagePort, path: path, data:false, filetype: type}, [ TODO THIS MUST BE A VALUE ]);
		// type error postMessage({type:'getFile', msg: typeof self.MessageChannel, prt: typeof self.MessagePort, path: path, data:false, filetype: type}, [ path ]);
/*
TODO
callback here, with id?
when file blob/arraybuffer comes in pass it to the callback
*/
		var cb = self.callbacks[path] || (self.callbacks[path] = []);
		// window will postMessage back with path and result + error
		cb.push(callback);
		postMessage({type:'getFile', path: path, filetype: type});
	};
	return exports.getFile(path, callback, type);
};

if(self.WorkerGlobalScope){
	self.callbacks = {};
// <message>.data: {path: data.path, error: err (eg {code:1}), file: <arraybuffer>, type:'<cb>'}, buffer ? [buffer]:null);
	self.addEventListener('message', function(e){
		var cb, data = e.data;
		if(data.type !== '<cb>' || !(cb = self.callbacks[data.path])) return;
		//throw 'THROW:'+JSON.stringify(data);
		// cleanup 1st then do work
		delete self.callbacks[data.path];
		cb.forEach(function(cb){
			cb(this.error, this.file);
		}, data);
	});
};
// http://www.html5rocks.com/en/tutorials/file/xhr2/
exports.getUrl = function(url, callback, type){
	var xhr;
	xhr = new XMLHttpRequest();
	xhr.open('GET', url, true);
	if(type){
		xhr.responseType = type;
		if(type === 'json') xhr.setRequestHeader('Accept', 'application/json');
	};
	function finish(e){
		this.removeEventListener('error',finish);
		this.removeEventListener('load',finish);
		// in this case the err is actuall a dual purpose callback
		if(e.type === 'load'){
			callback.call(this, false, this.response);
		}else{ // error
			callback(this);
		};
	};
	xhr.addEventListener('error', finish);
	xhr.addEventListener('load', finish);
	xhr.send();
	return xhr;
};
/*
requested -> path -> resolution ...

local requests:
	chrome (relative path)
	./something -> http..../something -> callback
	cordova (relative path)
	./something -> file..../something -> callback
remote requests (all):
	http.... -> check for file.../something -> fallback to http.... -> save + callback

all failures: callback(error);
all successes: callback(false, result);
*/
exports.getAsset = function(url, callback, type){
/*
TODO: abort
	- xhr localhost has abort method
	- getFile ?
	- getFile ...?

*/
	var path, reqFS = self.requestFileSystem;
	path = exports.getPath(url, type);
	if(!/^http/i.test(url)){
	// all local requests have relative paths
		// chrome, etc (probably localhost)
		if(/^http/.test(path)) exports.getUrl(path, callback, type);
		// app on device
		else if(/^file/.test(path)) exports.getFile(path, callback, type);
	}else{
		exports.getFile(path, function tryFile(err, data){
	//		throw 'err:'+(err ? JSON.stringify(err):'<none>') +' bytes:'+ (data ? data.byteLength : '<none>');
			if(callback.abort) return;
			if(err){
				exports.getUrl(url, function tryUrl(err, data){
					callback(err, data);
					if(!err){
						exports.saveFile(path, data, this.getResponseHeader('Content-Type'));
					};
				}, type);
			}else callback(false, data);
		}, type);
	};

/***** NOTE standard way of messaging the Style instance like map.style.misc(<byteArray>);
var b = new ArrayBuffer(22);
if(self.WorkerGlobalScope){
	postMessage({type:'misc', data:b}, [b]);
};
*/
	return {abort:function(){
		// ignore the result
		callback = function(err, data){ };
		callback.abort = true;
	}};
};
exports.getArrayBuffer = function(url, callback){
	return exports.getAsset(url, function(err, data){
//		throw '>err:'+(err ? JSON.stringify(err):'<none>') +' bytes:'+ (data ? data.byteLength : '<none>');
		callback(err, data)
	}, 'arraybuffer');
};
// caller js/style/style.js 72:ajax.getJSON(...
// caller js/source/source.js 44:ajax.getJSON(...
// caller js/style/image_sprite.js 16:ajax.getJSON(...
// js/ui/map.js 824: console.error XMLHttpRequestProgressEvent
exports.getJSON = function(url, callback){
	return exports.getAsset(url, callback, 'json');
};

exports.getImage = function(url, callback) {
    return exports.getArrayBuffer(url, function imgArrayBuffer(err, imgData) {
        if (err) return callback(err);
        var img = new Image();
        img.onload = function() {
            callback(false, img);
            (window.URL || window.webkitURL).revokeObjectURL(img.src);
        };
        var blob = new Blob([new Uint8Array(imgData)], { type: 'image/png' });
        img.src = (window.URL || window.webkitURL).createObjectURL(blob);
        img.getData = function() {
            var canvas = document.createElement('canvas');
            var context = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            context.drawImage(img, 0, 0);
            return context.getImageData(0, 0, img.width, img.height).data;
        };
        return img;
    });
};

function sameOrigin(url) {
    var a = document.createElement('a');
    a.href = url;
    return a.protocol === document.location.protocol && a.host === document.location.host;
}

exports.getVideo = function(urls, callback) {
    var video = document.createElement('video');
    video.onloadstart = function() {
        callback(false, video);
    };
    for (var i = 0; i < urls.length; i++) {
        var s = document.createElement('source');
        if (!sameOrigin(urls[i])) {
            video.crossOrigin = 'Anonymous';
        }
        s.src = urls[i];
        video.appendChild(s);
    }
    video.getData = function() { return video; };
    return video;
};
