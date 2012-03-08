nauto is a cli application used to monitor a git repository, and run a deployment script if changes are detected.

Prerequisites:
make
libssl-dev
build-essential
curl
git-core

nauto depends on node.  to ensure the a compatible version of node is available, node will be installed when nauto is setup.

Local Installation
------------------
`git clone git://github.com/jstewmon/nauto.git`
`cd nauto/deployment; sudo ./ubuntu.sh; cd ..; make environment`


Remote Installation
-------------------
`SSH_USER=<sudo_user> REMOTE=<remote_host> make setup_remote --environment-overrides`

Additionally, you may also speicfy `NAUTO_USER` and `NAUTO_DIR` to control the settings used on the remote host. The defaults are `nauto` and `/var/nauto`, respectively.

Remote Update
-------------
When an update is available on github, it can be deployed by running the following:

`SSH_USER=<sudo_user> REMOTE=<remote_host> make update_remote`

Setting up a deployment
-----------------------
1.  Clone the repo containing the project.
    
    `git clone git://github...`

2.  Edit crontab to run controller.
    
    `crontab -e`
    
    */5 * * * * root cd /var/nauto && export PATH=/var/nauto/bin:$PATH; export NODE_ENV=integration; node controller.js -b origin/master --cwd=/var/nauto/watch/myrepo -d ./deployment/deployer.js 2>&1 >> /var/log/cron_nauto.log