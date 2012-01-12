var fs = require('fs');
var path = require('path');
var util = require('util');
var exec = require('child_process').exec;

var git = module.exports = function(cwd) {
  self = this;
  self.cwd = cwd;

  var _exec = function(command, callback) {
    var proc = exec(command, {cwd: self.cwd}, function commandComplete(error, stdout, stderr) {
      if(error) {
        callback({error: error, stderr: stderr});
      }
      else callback(null, stdout);
    });
  };

  this.refs = function(pattern, callback) {
    var text = "git for-each-ref --format='{\"refname\":\"%(refname:short)\", \"upstream\":\"%(upstream:short)\"}' %s";
    return _exec(util.format(text, pattern), callback);
  };

  this.fetch = function(remote, callback) {
    var aliasRegex = new Regex('(^[^/]*)(\/.*)?$');
    remote = remote.replace(aliasRegex, '$1');
    var command = util.format('git fetch %s', remote || '--all');
    return _exec(command, callback);
  };

  this.merge = function(sources, options, callback) {
    var args = Array.prototype.slice.call(arguments, 0);
    sources = Array.isArray(sources = args.shift()) ? sources : [sources];
    callback = args.pop();
    options = args.shift();

    var commandArgs = self.parsers.optionsToArray(options);
    var command = util.format('git merge %s %s', commandArgs.join(' '), sources.join(' '));
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
    // The switched line only prints if we're TTY apparently
    // newBranch: function(stdout, callback) {
    //   var lines = stdout.split('\n');
    //   var createLine = lines.pop();
    //   var createRegex = /(Switched\sto\sa\snew\sbranch\s')(\w+)(')/;
    //   if(createRegex.test(createLine)) {
    //     callback(null, createLine.replace(createRegex, '$2'));
    //   }
    //   else callback('Could not parse output');
    // },
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
