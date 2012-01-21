var fs = require('fs');
var path = require('path');
var util = require('util');
var exec = require('child_process').exec;

var make = module.exports = function(cwd, options) {
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

  this.make = function(targets, variables, options, callback) {

    if(!Array.isArray(targets)) {
      targets = [targets];
    }

    var assert = require('assert');
    assert.equal(typeof variables, 'object', "Argument 'variables' must be an object");
    assert.equal(typeof options, 'object', "Argument 'options' must be an object");
    assert.equal(typeof callback, 'function', "Argument 'callback' must be a function");

    var variableArray = self.parsers.variablesToArray(variables);
    var optionArray = self.parsers.optionsToArray(options);

    var command = util.format('%s make %s %s', variableArray.join(' '), optionArray.join(' '), targets.join (' '));
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
    variablesToArray: function(variables) {
      var variableArray = [];
      for(var i in variables) {
        var value;
        switch(typeof variables[i]) {
          case 'object':
            value = util.format('"%s"', Array.isArray(variables[i]) ? variables[i].join(' ') : variables[i].toString());
          break;
          case 'string':
            value = util.format('"%s"', variables[i]);
          break;
          case 'number':
            value = variables[i];
          break;
        }
        variableArray.push(util.format('export %s=%s;', i, value));
      }
      return variableArray;
    }
  };
};