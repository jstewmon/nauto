var fs = require('fs');
var path = require('path');
var util = require('util');
var exec = require('child_process').exec;
var async = require('async');
var express = require('express');
var nconf = require('nconf');
var nodemailer = require('nodemailer');
var handlebars = require('handlebars');
var git = require('./lib/git.js');


var cliOptions = {
  branch: {
    alias: 'b',
    describe: 'The branch to check for changes.',
    demand: true
  },
  cwd: {
		describe: 'The working directory of the git repo.',
		demand: true
  },
  targets: {
    alias: '-t',
    describe: 'The location of the file containing the target definition.  A relative path is rooted by cwd.'
  }
};
nconf.argv(cliOptions);
nconf.env();
var targets = nconf.get('targets') ? path.resolve(nconf.get('cwd'), nconf.get('targets')) : path.join(__dirname, 'targets.json');
nconf.add('targets', {type: 'file', file: targets});
var config = nconf.load();

//  ssh nodequest.glgdev.com 'cd nodequest; git checkout master; git pull; make server-a_stop; make server-a_start'

// nauto --branch=origin/production --cwd=/Users/home/jstewmon/Projects/nodequest --targets=ops/targets.json

var g = git.createClient(config.cwd);

async.parallel({
	locals: async.apply(g.refs, 'refs/heads'),
	remotes: async.apply(g.refs, 'refs/remotes')
}, function parallelComplete(err, results) {
	if(err) {
		console.error(err.stderr);
		process.exit(1);
	}
	var localFiltered = results.locals.filter(function(ref) {
		return ref.refname == config.branch || ref.upstream == config.branch;
	});
	var local = localFiltered.length === 0 ? null : localFiltered[0];

	if(local && local.upstream) {
		// TODO: exit this mess here
	}

	var remoteFiltered = local ? results.remotes.filter(function(ref) { return ref.refname == local.upstream; })
		: results.remotes.filter(function(ref) { return ref.refname == config.branch; });
	var remote = remoteFiltered.length === 0 ? null : remoteFiltered[0];

	if(!local && !remote) {
		console.error('%s was not found in the local or remote branches', config.branch);
		process.exit(1);
	}
	if(local && !local.upstream) {
		console.error('Local branch %s is not tracking an upstream. Try running something like git branch --set-upstream %s origin/%s', local.refname, local.refname);
		process.exit(1);
	}
	if(!local) {
		console.log('Found remote %s, but it is not tracking locally.  Creating local branch...', remote.refname);
		async.series({
			//pull: function(callback) { g.pull(callback); },
			checkout: async.apply(g.checkout, remote.refname, {track: true}),// function(callback) { g.checkout(remote.refname, {track: true}, callback); }
			locals: async.apply(g.refs, 'refs/heads')
		}, function(err, results) {
				if(err) {
					console.error(err['stderr'] || err);
					process.exit(1);
				}
				var local = results.locals.filter(function(ref) { return ref.upstream == config.branch; })[0];
				// console.log(results.checkout);
				console.log('Created %s with upstream %s', local.refname, local.upstream);
			});
	}
});



//* deploy 998f00b tweaked gitignore. added rebuild phony to makefile

function resolve() {
	var args = arguments;
	Array.prototype.unshift.call(args, __dirname);
	return path.resolve.apply(path, args);
}

function loadTemplateFile(name, cb) {
	fs.readFile(path.join(resolve('./templates'), name), 'utf8', function (err, data) {
		if (err) cb(err);
		else cb(null, data);
	});
}

// one time action to set up SMTP information
// nodemailer.SMTP = {
//     host: 'localhost'
// };
nodemailer.sendmail = '/usr/sbin/sendmail';
var app = express.createServer();

app.configure(function() {
	app.use(express.bodyParser());
	app.use(app.router);
});

app.post('/post-receive', function(req, res) {
	var payload = JSON.parse(req.body.payload);
	res.send('i parsed you');
	
	loadTemplateFile('post-receive.txt', function loadedTemplate(err, source) {
		if(err) {
			console.error(err);
		}
		else {
			var template = handlebars.compile(source);
			var output = template({payload: JSON.stringify(payload, null, 2)});
			
			console.log('output:');
			console.log(output);
			
			// send an e-mail
			nodemailer.send_mail(
				// e-mail options
				{
					sender: 'jstewmon@gmail.com',
					to:'jstewmon@glgroup.com',
					subject:'post-receive hook called',
					//html: '<p><b>Hi,</b> how are you doing?</p>',
					body: output
				},
				// callback function
				function(err, success) {
					if(err) {
						console.error('Failed to send message...');
						console.error(err);
					}
					else {
						console.log('Message sent');
					}
				}
			);
		}
	});
});

app.get('*', function(req, res) {
	res.send('bugger off', 500);
});

//app.listen(3111);