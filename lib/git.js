var fs = require('fs');
var path = require('path');
var util = require('util');
var exec = require('child_process').exec;

var git = module.exports = function(cwd, options) {
  self = this;
  self.cwd = cwd || process.cwd();
  self.options = options || {};
  self.stdout = options.log || function nullLog(data) {};
  self.stderr = options.error || function nullLog(err) {};

  var _exec = function(command, callback) {
    console.log('executing:', command);
    var proc = exec(command, {cwd: self.cwd}, function commandComplete(error, stdout, stderr) {
      if(error) {
        self.stderr(stderr);
        callback({error: error, stderr: stderr});
      }
      else {
        self.stdout(stdout);
        callback(null, stdout);
      }
    });
  };

  this.refs = function(pattern, callback) {
    var text = "git for-each-ref --format='{\"objectname\":\"%(objectname:short)\", \"refname\":\"%(refname:short)\", \"upstream\":\"%(upstream:short)\"}' %s";
    return _exec(util.format(text, pattern), callback);
  };

  this.fetch = function(remote, callback) {
    var aliasRegex = new RegExp('(^[^/]*)(\/.*)?$');
    remote = remote.replace(aliasRegex, '$1');
    var command = util.format('git fetch %s', remote || '--all');
    return _exec(command, callback);
  };

  this.merge = function(sources, options, callback) {
    var args = Array.prototype.slice.call(arguments, 0);
    sources = Array.isArray(sources = args.shift()) ? sources : [sources];
    callback = args.pop();
    options = args.shift() || {};

    var commandArgs = self.parsers.optionsToArray(options);
    var command = util.format('git merge %s %s', commandArgs.join(' '), sources.join(' '));
    return _exec(command, callback);
  };

  this.log = function(since, until, options, callback) {
    var args = Array.prototype.slice.call(arguments, 0);
    if(args.length < 4) {
      callback = args.pop();
      if(args.length) {
        options = args.pop();
        if(typeof options !== 'object') {
          options = {};
        }
      }
      else {
        options = {};
        since = until = '';
      }
    }
    var assert = require('assert');
    assert.equal(typeof since, 'string', "Argument 'since' must be a string if supplied");
    assert.equal(typeof until, 'string', "Argument 'until' must be a string if supplied");
    assert.equal(typeof options, 'object', "Argument 'options' must be an object if supplied");
    assert.equal(typeof callback, 'function', "Argument 'callback' must be a function");

    var range = until ? util.format('%s..%s', since, until) : since;
    var commandArgs = self.parsers.optionsToArray(options);
    var command = util.format('git log %s %s', commandArgs.join(' '), range);
    return _exec(command, callback);
  };

  this.pull = function(callback) {
    var command = 'git pull';
    return _exec(command, callback);
  };

  this.checkout = function(branch, options, callback) {

    if(!callback) {
      callback = options;
      options = {};
    }
    var args = self.parsers.optionsToArray(options);
    var command = util.format('git checkout %s %s', args.join(' '), branch);
    return _exec(command, callback);
  };

  this.reset = function(commit, options, callback) {
    
    if(!callback) {
      callback = options;
      options = {};
    }
    var args = self.parsers.optionsToArray(options);
    var command = util.format('git reset %s %s', args.join (' '), commit);
    return _exec(command, callback);
  };

  this.parsers = {
    optionsToArray: function(options) {
      var args = [];
      Object.keys(options).forEach(function(key) {
        var option = options[key];
        if(typeof(option) === 'boolean')
          args.push(util.format('--%s', key));
        else if(typeof(option) === 'number')
          args.push(util.format('--%s=%d', key, option));
        else args.push(util.format('--%s=\'%s\'', key, option));
      });
      return args;
    },
    refs: function(stdout, callback) {
      var refs = [];
      stdout.split('\n').forEach(function(ref) {
        if(ref.trim()) {
          refs.push(JSON.parse(ref));
        }
      });
      callback(null, refs);
    }
  };
};
