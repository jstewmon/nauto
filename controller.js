#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var util = require('util');
var proc = require('procstreams');
var async = require('async');
var nconf = require('nconf');


var cliOptions = {
  branch: {
    alias: 'b',
    demand: true,
    describe: 'The branch to check for changes.'
  },
  cwd: {
    demand: true,
    describe: 'The working directory of the git repo.'
  },
  environment: {
    alias: 'e',
    demand: false,
    describe: 'The environment to deploy, such as production or staging. Defaults to $NODE_ENV'
  },
  deployer: {
    alias: 'd',
    demand: true,
    describe: 'The script in cwd that will be used to perform the deployment if changes are detected.'
  },
  'show-output': {
    alias: 'o',
    describe: 'Causes output of child processes to be piped to stdout'
  },
  force: {
    alias: 'f',
    describe: 'Force deployment, even if there are no changes to the local repo.'
  }
};
nconf.argv(cliOptions);
nconf.env();
nconf.defaults({environment: nconf.get('NODE_ENV')});
var config = nconf.load();

process.chdir(config.cwd);
console.log(process.cwd());

var wrapData = function(callback) {
  return function(stdout, stderr) {
    callback(null, {stdout: stdout, stderr: stderr});
  };
};
var wrapError = function(callback) {
  return function(err, stdout, stderr) {
    callback({err: err, stdout: stdout, stderr: stderr});
  };
};
parsers = {
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

var gitProcOptions = {
  out: config['show-output']
};

async.auto({
  locals: function(callback) {
    proc('git', [
      'for-each-ref',
      '--format={"objectname": "%(objectname:short)", "refname": "%(refname:short)", "upstream":"%(upstream:short)"}',
      'refs/heads'
    ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
  },
  parseLocals: ['locals', function(callback, results) { parsers.refs(results.locals.stdout, callback); }],
  remotes: function(callback) {
    proc('git', [
      'for-each-ref',
      '--format={"objectname": "%(objectname:short)", "refname": "%(refname:short)", "upstream":"%(upstream:short)"}',
      'refs/remotes'
    ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
  },
  parseRemotes: ['remotes', function(callback, results) { parsers.refs(results.remotes.stdout, callback); }],
  findHead: function(callback) {
    proc('git', [
      'symbolic-ref',
      '-q',
      'HEAD'
    ], gitProcOptions).data(function(stdout, stderr) {
      if(stdout) {
        var shortname = stdout.replace(new RegExp('(refs\/heads\/)(.*)'), '$2').trim();
        callback(null, shortname);
      }
      else {
        callback('Failed to find HEAD');
      }
    });
  },
  checkBranch: ['parseLocals', 'parseRemotes', function(callback, results) {
    ensureTrackingBranch(config.branch, results.parseLocals, results.parseRemotes, callback);
  }],
  remoteName: ['checkBranch', function(callback, results) {
    callback(null, results.checkBranch.upstream.replace(new RegExp('(^[^/]*)(\/.*)?$'), '$1'));
  }],
  remoteUrl: ['remoteName', function(callback, results) {
    proc('git', [
      'config',
      '--get',
      util.format('remote.%s.url', results.remoteName)
    ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
  }],
  fetchRemote: ['remoteName', function(callback, results) {
    proc('git', [
      'fetch',
      results.remoteName
    ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
  }],
  logLocalRemote: ['fetchRemote', function(callback, results) {
    proc('git', [
      'log',
      util.format('%s..%s', results.checkBranch.refname, results.checkBranch.upstream)
    ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
  }],
  checkoutLocal: ['findHead', 'logLocalRemote', 'fetchRemote', function(callback, results) {
    proc('git', [
      'checkout',
      results.checkBranch.refname
    ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
  }],
  mergeRemote: ['logLocalRemote', 'checkoutLocal', function(callback, results) {
    proc('git', [
      'merge',
      results.checkBranch.upstream
    ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
  }],
  deployment: ['remoteUrl', 'mergeRemote', function(callback, results) {
    if(!results.logLocalRemote.stdout.trim() && !config.force) {
      return callback(null, 'Nothing to deploy.');
    }
    console.log('Proceding with deployment');
    var outerResults = results;
    try {
      var plugin = require(path.join(path.resolve(config.cwd), config.deployer));
      var deployer = new plugin(config.environment || config.NODE_ENV);
      async.auto({
        outer: function(callback) { callback(null, outerResults); },
        deploy: ['outer', function(callback, results) { deployer.deploy(callback, results); }],
        verify: ['deploy', function(callback, results) { deployer.verify(callback, results); }],
        commit: ['verify', function(callback, results) { deployer.commit(callback, results); }]
      }, function(err, results) {
        if(err) {
          results.error = err;
          try {
            deployer.rollback(function() { callback(err, results); }, results);
          }
          catch(rollbackError) {
            console.error('Error executing rollback:');
            console.error(rollbackError);
            callback(err, results);
          }
        }
        else {
          callback(null, results);
        }
      });
    }
    catch(error) {
      console.error('Error executing deployment:');
      console.error(error);
      callback(error);
    }
  }]
}, function(err, results) {
  if(err) {
    console.error(err);
    if(results.checkBranch) {
      console.log('Resetting %s to previous head (%s)', results.checkBranch.refname, results.checkBranch.objectname);
      
      async.auto({
        reset: function(callback) {
          proc('git', [
            'reset',
            '--hard',
            results.checkBranch.objectname
          ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
        },
        clean: ['reset', function(callback, results) {
          proc('git', [
            'clean',
            '-df'
          ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
        }]
      }, function(err, results) {
        process.exit();
      });
    }
    else {
      process.exit(1);
    }
  }
  else {
    console.log('Deployment completed.  These are the tasks that were preformed and their results:');
    for(var i in results) {
      console.log('%s:', i);
      console.log(results[i]);
    }
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
    checkout: function(callback) {
      proc('git', [
        'checkout',
        '--track',
        remote.refname
      ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
    },
    locals: ['checkout', function(callback, results) {
      proc('git', [
        'for-each-ref',
        '--format={"objectname": "%(objectname:short)", "refname": "%(refname:short)", "upstream":"%(upstream:short)"}',
        'refs/heads'
      ], gitProcOptions).data(wrapData(callback)).error(wrapError(callback));
    }],
    parseLocals: ['locals', function(callback, results) {
      parsers.refs(results.locals.stdout, callback);
    }],
    findLocal: ['parseLocals', function(callback, results) {
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
