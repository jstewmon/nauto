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

var g = new git(config.cwd, {log: console.log, error: console.error});

async.auto({
  locals: async.apply(g.refs, 'refs/heads'),
  parseLocals: ['locals', function(callback, results) { g.parsers.refs(results.locals, callback); }],//async.apply(g.parsers.refs)],
  remotes: async.apply(g.refs, 'refs/remotes'),
  parseRemotes: ['remotes', function(callback, results) { g.parsers.refs(results.remotes, callback); }],
  checkBranch: ['parseLocals', 'parseRemotes', function(callback, results) {
    // console.log(results.parseLocals);
    // console.log(results.parseRemotes);
    ensureTrackingBranch(config.branch, results.parseLocals, results.parseRemotes, callback);
  }],
  fetchRemote: ['checkBranch', function(callback, results) {
    g.fetch(results.checkBranch.upstream, callback);
  }],
  logLocalRemote: ['fetchRemote', function(callback, results) {
    g.log(results.checkBranch.refname, results.checkBranch.upstream, callback);
  }],
  checkoutLocal: ['fetchRemote', function(callback, results) {
    g.checkout(results.checkBranch.refname, callback);
  }],
  mergeRemote: ['logLocalRemote', 'checkoutLocal', function(callback, results) {
    g.merge(results.checkBranch.upstream, callback);
  }],
  deploy: ['logLocalRemote', 'mergeRemote', function(callback, results) {
    if(!results.logLocalRemote.trim()) {
      return callback(null, 'Nothing to deploy.');
    }
    var makeOptions = {
      'environment-overrides': true
    };
    var makeVariables = {
      'CLUSTER_USER': 'glgr',
      'CLUSTER_SERVERS': ['192.168.114.47', '192.168.114.107']
    };
    var make = require('./lib/make.js');
    var m = new make(config.cwd);
    m.make('cluster_environment', makeVariables, makeOptions, callback);
  }]
}, function(err, results) {
  if(err) {
    console.error(err['stderr'] || err);
    process.exit(1);
  }
  console.log('Deployment completed.  These are the tasks that were preformed and their results:');
  for(var i in results) {
    console.log('%s:', i);
    console.log(results[i]);
  }
});

var ensureTrackingBranch = function(trackingBranch, locals, remotes, callback) {
  var localFiltered = locals.filter(function(ref) {
    return ref.refname == trackingBranch || ref.upstream == trackingBranch;
  });
  // is the branch we're tracking a local ref?
  var local = localFiltered.length === 0 ? null : localFiltered[0];

  if(local) {
    return local.upstream ? callback(null, local)
                          : callback(util.format('Local branch %s is not tracking an upstream. Try running something like git branch --set-upstream %s origin/%s', local.refname, local.refname));
  }

  var remoteFiltered = remotes.filter(function(ref) { return ref.refname == trackingBranch; });
  // is the branch we're tracking a remote ref?
  var remote = remoteFiltered.length === 0 ? null : remoteFiltered[0];

  if(!remote) {
    return callback(util.format('%s was not found in the local or remote branches', trackingBranch));
  }

  console.log('Found remote %s, but it is not tracking locally.  Creating local branch...', remote.refname);
  async.auto({
    //pull: function(callback) { g.pull(callback); },
    checkout: async.apply(g.checkout, remote.refname, {track: true}),// function(callback) { g.checkout(remote.refname, {track: true}, callback); }
    locals: ['checkout', async.apply(g.refs, 'refs/heads')],
    parseLocals: ['locals', function(callback, results) {
      //console.log(results.locals);
      g.parsers.refs(results.locals, callback);
    }],
    findLocal: ['parseLocals', function(callback, results) {
      //console.log(results.parseLocals);
      callback(null, results.parseLocals.filter(function(ref) { return ref.upstream == trackingBranch; })[0]);
    }]
  }, function(err, results) {
      if(err) {
        return callback(err);
      }
      console.log('Created %s with upstream %s', results.findLocal.refname, results.findLocal.upstream);
      callback(null, results.findLocal);
    });
};

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