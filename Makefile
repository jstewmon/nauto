CWD := $(shell pwd)
BIN = $(CWD)/bin
SSH_USER = $(shell whoami)
SSH_OPTS = -o UserKnownHostsFile=/dev/null \
						-o StrictHostKeyChecking=no \
						-o ConnectTimeout=5
NODE = $(CWD)/bin/node

NAUTO_USER = nauto
NAUTO_GROUP = GLGDEV\domain^admins
NAUTO_DIR = /var/$(NAUTO_USER)

NODE_URL = git://github.com/joyent/node.git
NODE_V = v0.6.9
WITH_NODE = export PATH=$(BIN):$(PATH); export NODE_ENV=$(NODE_ENV);

GIT_URL = git://github.com/jstewmon/nauto.git
TAG = master

REMOTE_SCRIPT = $(CWD)/deployment/ubuntu.sh

.PHONY: environment \
				install_node \
				update_node \
				install_app_modules \
				rebuild_app_modules \
				deploy

environment:
	$(MAKE) --environment-overrides update_node
	$(MAKE) install_app_modules
	if [ ! -d $(CWD)/watch ]; then mkdir $(CWD)/watch; fi;

install_node:
	cd packages/node; ./configure --prefix=$(CWD); $(MAKE); $(MAKE) -j install
	$(MAKE) --environment-overrides install_app_modules rebuild_app_modules

update_node:
	# if clone is ok, checkout node_v and make install_node
	# else if packages/node is on a tag, but not the tag for node_v, fetch origin, checkout node_v and make install_node
	# if any of that failed, delete package/node, clone it, checkout node_v and make install_node
	# easy, right?
	git clone $(NODE_URL) $(CWD)/packages/node && cd $(CWD)/packages/node && git checkout $(NODE_V) && cd $(CWD) && $(MAKE) install_node; \
	if [ ! $$? = 0 ]; \
		then cd $(CWD)/packages/node; \
		git describe && if [ ! "$(NODE_V)" = `git describe` ]; \
			then git fetch origin && git checkout $(NODE_V) && cd $(CWD) && $(MAKE) install_node; \
			else echo 'node repo already on $(NODE_V)'; \
		fi; \
	fi; \
	if [ ! $$? = 0 ]; \
		then cd $(CWD) \
			&& rm -rf $(CWD)/packages/node \
			&& git clone $(NODE_URL) $(CWD)/packages/node \
			&& cd $(CWD)/packages/node && git checkout $(NODE_V) \
			&& cd $(CWD) && $(MAKE) install_node; \
	fi;

install_app_modules:
	$(WITH_NODE) npm prune; npm install

rebuild_app_modules:
	$(WITH_NODE) npm rebuild

setup_remote:
	scp $(SSH_OPTS) $(REMOTE_SCRIPT) $(SSH_USER)@$(REMOTE):nauto_setup.sh
	ssh $(SSH_OPTS) -t $(SSH_USER)@$(REMOTE) \
		"chmod +x ./nauto_setup.sh && sudo NAUTO_USER=$(NAUTO_USER) NAUTO_DIR=$(NAUTO_DIR) ./nauto_setup.sh && git clone $(GIT_URL) $(NAUTO_DIR); cd $(NAUTO_DIR) && make --environment-overrides environment"

update_remote:
	ssh $(SSH_OPTS) $(SSH_USER)@$(REMOTE) 'cd /var/nauto && git pull origin && make --environment-overrides environment'

deploy:
	$(WITH_NODE) node $(CWD)/controller.js -b $(BRANCH) --cwd=$(REPO_DIR) -d $(DEPLOY_SCRIPT) -o 
