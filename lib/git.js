var fs = require('fs');
var path = require('path');
var util = require('util');
var exec = require('child_process').exec;

exports.createClient = function(cwd) {
	return new git(cwd);
};

var git = function(cwd) {
	self = this;
	self.cwd = cwd;
};

git.prototype.refs = function(pattern, callback) {
	var text = "git for-each-ref --format='{\"refname\":\"%(refname:short)\", \"upstream\":\"%(upstream:short)\"}' %s";
	var command = exec(util.format(text, pattern), {cwd: self.cwd}, function(error, stdout, stderr) {
		if(error) {
			callback({error: error, stderr: stderr});
		}
		else {
			var refs = [];
			stdout.split('\n').forEach(function(ref) {
				if(ref.trim()) {
					refs.push(JSON.parse(ref));
				}
			});
			callback(null, refs);
		}
	});
};

git.prototype.pull = function(callback) {
	var pull = exec('git pull', {cwd: self.cwd}, function(error, stdout, stderr) {
		if(error) {
			callback({error: error, stderr: stderr});
		}
		else {
			callback(null, stdout);
		}
	});
};

git.prototype.checkout = function(branch, options, callback) {

	if(!callback) {
		callback = options;
		options = {};
	}
	var args = [];
	Object.keys(options).forEach(function(key) {
		var option = options[key];
		if(typeof(option) === 'boolean')
			args.push(util.format('--%s', key));
		else if(typeof(option) === 'number')
			args.push(util.format('--%s=%d', key, option));
		else args.push(util.format('--%s=\'%s\'', key, option));
	});

	var command = util.format('git checkout %s %s', args.join(' '), branch);
	var checkout = exec(command, {cwd: self.cwd}, function(error, stdout, stderr) {
		if(error) {
			callback({error: error, stderr: stderr});
		}
		else {
			callback(null, stdout);
		}
	});
};

git.prototype.parsers = {
	newBranch: function(stdout, callback) {
		var lines = stdout.split('\n');
		var createLine = lines.pop();
		var createRegex = /(Switched\sto\sa\snew\sbranch\s')(\w+)(')/;
		if(createRegex.test(createLine)) {
			callback(null, createLine.replace(createRegex, '$2'));
		}
		else callback('Could not parse output');
	}
};