GO ?= $(shell command -v go 2> /dev/null)
NPM ?= $(shell command -v npm 2> /dev/null)
CURL ?= $(shell command -v curl 2> /dev/null)
MM_DEBUG ?=
MANIFEST_FILE ?= plugin.json
GOPATH ?= $(shell go env GOPATH)
GO_TEST_FLAGS ?= -race
GO_BUILD_FLAGS ?=
MM_UTILITIES_DIR ?= ../mattermost-utilities
DLV_DEBUG_PORT := 2346
DEFAULT_GOOS := $(shell go env GOOS)
DEFAULT_GOARCH := $(shell go env GOARCH)
BUILD_HASH = $(shell git rev-parse HEAD)
LDFLAGS += -X "main.buildHash=$(BUILD_HASH)"
LDFLAGS+= -X "main.isDebug=$(MM_DEBUG)"
LDFLAGS += -X "main.rudderWriteKey=$(MM_RUDDER_CALLS_PROD)"
LDFLAGS += -X "main.rudderDataplaneURL=$(MM_RUDDER_DATAPLANE_URL)"

export GO111MODULE=on

# We need to export GOBIN to allow it to be set
# for processes spawned from the Makefile
export GOBIN ?= $(PWD)/bin

# You can include assets this directory into the bundle. This can be e.g. used to include profile pictures.
ASSETS_DIR ?= server/assets

## Define the default target (make all)
.PHONY: default
default: all

# Verify environment, and define PLUGIN_ID, PLUGIN_VERSION, HAS_SERVER and HAS_WEBAPP as needed.
include build/setup.mk

BUNDLE_NAME ?= $(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz

# Include custom makefile, if present
ifneq ($(wildcard build/custom.mk),)
	include build/custom.mk
endif

# ====================================================================================
# Used for semver bumping
PROTECTED_BRANCH := main
APP_NAME    := $(shell basename -s .git `git config --get remote.origin.url`)
CURRENT_VERSION := $(shell git describe --abbrev=0 --tags)
VERSION_PARTS := $(subst ., ,$(subst v,,$(subst -rc, ,$(CURRENT_VERSION))))
MAJOR := $(word 1,$(VERSION_PARTS))
MINOR := $(word 2,$(VERSION_PARTS))
PATCH := $(word 3,$(VERSION_PARTS))
RC := $(shell echo $(CURRENT_VERSION) | grep -oE 'rc[0-9]+' | sed 's/rc//')
# Check if current branch is protected
define check_protected_branch
	@current_branch=$$(git rev-parse --abbrev-ref HEAD); \
	if ! echo "$(PROTECTED_BRANCH)" | grep -wq "$$current_branch" && ! echo "$$current_branch" | grep -q "^release"; then \
		echo "Error: Tagging is only allowed from $(PROTECTED_BRANCH) or release branches. You are on $$current_branch branch."; \
		exit 1; \
	fi
endef
# Check if there are pending pulls
define check_pending_pulls
	@git fetch; \
	current_branch=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$(git rev-parse HEAD)" != "$$(git rev-parse origin/$$current_branch)" ]; then \
		echo "Error: Your branch is not up to date with upstream. Please pull the latest changes before performing a release"; \
		exit 1; \
	fi
endef
# Prompt for approval
define prompt_approval
	@read -p "About to bump $(APP_NAME) to version $(1), approve? (y/n) " userinput; \
	if [ "$$userinput" != "y" ]; then \
		echo "Bump aborted."; \
		exit 1; \
	fi
endef
# ====================================================================================

.PHONY: patch minor major patch-rc minor-rc major-rc

patch: ## to bump patch version (semver)
	$(call check_protected_branch)
	$(call check_pending_pulls)
	@$(eval PATCH := $(shell echo $$(($(PATCH)+1))))
	$(call prompt_approval,$(MAJOR).$(MINOR).$(PATCH))
	@echo Bumping $(APP_NAME) to Patch version $(MAJOR).$(MINOR).$(PATCH)
	git tag -s -a v$(MAJOR).$(MINOR).$(PATCH) -m "Bumping $(APP_NAME) to Patch version $(MAJOR).$(MINOR).$(PATCH)"
	git push origin v$(MAJOR).$(MINOR).$(PATCH)
	@echo Bumped $(APP_NAME) to Patch version $(MAJOR).$(MINOR).$(PATCH)

minor: ## to bump minor version (semver)
	$(call check_protected_branch)
	$(call check_pending_pulls)
	@$(eval MINOR := $(shell echo $$(($(MINOR)+1))))
	@$(eval PATCH := 0)
	$(call prompt_approval,$(MAJOR).$(MINOR).$(PATCH))
	@echo Bumping $(APP_NAME) to Minor version $(MAJOR).$(MINOR).$(PATCH)
	git tag -s -a v$(MAJOR).$(MINOR).$(PATCH) -m "Bumping $(APP_NAME) to Minor version $(MAJOR).$(MINOR).$(PATCH)"
	git push origin v$(MAJOR).$(MINOR).$(PATCH)
	@echo Bumped $(APP_NAME) to Minor version $(MAJOR).$(MINOR).$(PATCH)

major: ## to bump major version (semver)
	$(call check_protected_branch)
	$(call check_pending_pulls)
	$(eval MAJOR := $(shell echo $$(($(MAJOR)+1))))
	$(eval MINOR := 0)
	$(eval PATCH := 0)
	$(call prompt_approval,$(MAJOR).$(MINOR).$(PATCH))
	@echo Bumping $(APP_NAME) to Major version $(MAJOR).$(MINOR).$(PATCH)
	git tag -s -a v$(MAJOR).$(MINOR).$(PATCH) -m "Bumping $(APP_NAME) to Major version $(MAJOR).$(MINOR).$(PATCH)"
	git push origin v$(MAJOR).$(MINOR).$(PATCH)
	@echo Bumped $(APP_NAME) to Major version $(MAJOR).$(MINOR).$(PATCH)

patch-rc: ## to bump patch release candidate version (semver)
	$(call check_protected_branch)
	$(call check_pending_pulls)
	@$(eval RC := $(shell echo $$(($(RC)+1))))
	$(call prompt_approval,$(MAJOR).$(MINOR).$(PATCH)-rc$(RC))
	@echo Bumping $(APP_NAME) to Patch RC version $(MAJOR).$(MINOR).$(PATCH)-rc$(RC)
	git tag -s -a v$(MAJOR).$(MINOR).$(PATCH)-rc$(RC) -m "Bumping $(APP_NAME) to Patch RC version $(MAJOR).$(MINOR).$(PATCH)-rc$(RC)"
	git push origin v$(MAJOR).$(MINOR).$(PATCH)-rc$(RC)
	@echo Bumped $(APP_NAME) to Patch RC version $(MAJOR).$(MINOR).$(PATCH)-rc$(RC)

minor-rc: ## to bump minor release candidate version (semver)
	$(call check_protected_branch)
	$(call check_pending_pulls)
	@$(eval MINOR := $(shell echo $$(($(MINOR)+1))))
	@$(eval PATCH := 0)
	@$(eval RC := 1)
	$(call prompt_approval,$(MAJOR).$(MINOR).$(PATCH)-rc$(RC))
	@echo Bumping $(APP_NAME) to Minor RC version $(MAJOR).$(MINOR).$(PATCH)-rc$(RC)
	git tag -s -a v$(MAJOR).$(MINOR).$(PATCH)-rc$(RC) -m "Bumping $(APP_NAME) to Minor RC version $(MAJOR).$(MINOR).$(PATCH)-rc$(RC)"
	git push origin v$(MAJOR).$(MINOR).$(PATCH)-rc$(RC)
	@echo Bumped $(APP_NAME) to Minor RC version $(MAJOR).$(MINOR).$(PATCH)-rc$(RC)

major-rc: ## to bump major release candidate version (semver)
	$(call check_protected_branch)
	$(call check_pending_pulls)
	@$(eval MAJOR := $(shell echo $$(($(MAJOR)+1))))
	@$(eval MINOR := 0)
	@$(eval PATCH := 0)
	@$(eval RC := 1)
	$(call prompt_approval,$(MAJOR).$(MINOR).$(PATCH)-rc$(RC))
	@echo Bumping $(APP_NAME) to Major RC version $(MAJOR).$(MINOR).$(PATCH)-rc$(RC)
	git tag -s -a v$(MAJOR).$(MINOR).$(PATCH)-rc$(RC) -m "Bumping $(APP_NAME) to Major RC version $(MAJOR).$(MINOR).$(PATCH)-rc$(RC)"
	git push origin v$(MAJOR).$(MINOR).$(PATCH)-rc$(RC)
	@echo Bumped $(APP_NAME) to Major RC version $(MAJOR).$(MINOR).$(PATCH)-rc$(RC)

## Checks the code style, tests, builds and bundles the plugin.
.PHONY: all
all: check-style test dist

## Ensures the plugin manifest is valid
.PHONY: manifest-check
manifest-check:
	./build/bin/manifest check

## Propagates plugin manifest information into the server/ and webapp/ folders.
.PHONY: apply
apply:
	./build/bin/manifest apply

## Check go mod files consistency
.PHONY: gomod-check
gomod-check:
	@echo Checking go mod files consistency
	go mod tidy -v && git --no-pager diff --exit-code go.mod go.sum || (echo "Please run \"go mod tidy\" and commit the changes in go.mod and go.sum." && exit 1)

## Check i18 files
.PHONY: i18n-check
i18n-check:
	@echo Checking i18n files
	cd webapp && $(NPM) run extract && git --no-pager diff --exit-code i18n/en.json || (echo "Missing translations. Please run \"make i18n-extract\" and commit the changes." && exit 1)
	cd standalone && $(NPM) run extract && git --no-pager diff --exit-code i18n/en.json || (echo "Missing translations. Please run \"make i18n-extract\" and commit the changes." && exit 1)

	$(GO) install -modfile=go.tools.mod github.com/mattermost/mattermost-utilities/mmgotool
	mkdir -p server/i18n
	cd server && $(GOBIN)/mmgotool i18n clean-empty --portal-dir="" --check
	cd server && $(GOBIN)/mmgotool i18n check-empty-src --portal-dir=""

## Runs eslint and golangci-lint
.PHONY: check-style
check-style: manifest-check apply golangci-lint webapp/node_modules standalone/node_modules e2e/node_modules gomod-check i18n-check
	@echo Checking for style guide compliance

ifneq ($(HAS_WEBAPP),)
	cd webapp && npm run lint && npm run check-types
	cd standalone && npm run lint && npm run check-types
	cd e2e && npm run lint && npm run check-types
endif

golangci-lint: ## Run golangci-lint on codebase
ifneq ($(HAS_SERVER),)
	@if ! [ -x "$$(command -v golangci-lint)" ]; then \
		echo "golangci-lint is not installed. Please see https://github.com/golangci/golangci-lint#install for installation instructions."; \
		exit 1; \
	fi; \

	@echo Running golangci-lint
	golangci-lint run ./server/...
	cd server/public && golangci-lint run ./...
endif

## Builds the server, if it exists, for all supported architectures, unless MM_SERVICESETTINGS_ENABLEDEVELOPER is set
.PHONY: server
server:
ifneq ($(HAS_SERVER),)
	mkdir -p server/dist;
ifeq ($(MM_DEBUG),)
ifneq ($(MM_SERVICESETTINGS_ENABLEDEVELOPER),)
	cd server && env CGO_ENABLED=0 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -trimpath -o dist/plugin-$(DEFAULT_GOOS)-$(DEFAULT_GOARCH);
else
	cd server && env CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -trimpath -o dist/plugin-linux-amd64;
	cd server && env CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -trimpath -o dist/plugin-linux-arm64;
	cd server && env CGO_ENABLED=0 GOOS=freebsd GOARCH=amd64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -trimpath -o dist/plugin-freebsd-amd64;
	cd server && env CGO_ENABLED=0 GOOS=openbsd GOARCH=amd64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -trimpath -o dist/plugin-openbsd-amd64;
endif
else
	$(info DEBUG mode is on; to disable, unset MM_DEBUG)
ifneq ($(MM_SERVICESETTINGS_ENABLEDEVELOPER),)
	cd server && env CGO_ENABLED=0 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -gcflags "all=-N -l" -trimpath -o dist/plugin-$(DEFAULT_GOOS)-$(DEFAULT_GOARCH);
else
	cd server && env CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -gcflags "all=-N -l" -trimpath -o dist/plugin-linux-amd64;
	cd server && env CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -gcflags "all=-N -l" -trimpath -o dist/plugin-linux-arm64;
	cd server && env CGO_ENABLED=0 GOOS=freebsd GOARCH=amd64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -gcflags "all=-N -l" -trimpath -o dist/plugin-freebsd-amd64;
	cd server && env CGO_ENABLED=0 GOOS=openbsd GOARCH=amd64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -gcflags "all=-N -l" -trimpath -o dist/plugin-openbsd-amd64;
endif
endif
endif

## Builds the server on ci -- only build for linux-amd64, linux-arm64, freebsd-amd64 and openbsd-amd64 (for now)
.PHONY: server-ci
server-ci:
ifneq ($(HAS_SERVER),)
	mkdir -p server/dist;
ifneq ($(MM_SERVICESETTINGS_ENABLEDEVELOPER),)
	cd server && env CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -trimpath -o dist/plugin-linux-amd64;
else
	cd server && env CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -trimpath -o dist/plugin-linux-amd64;
	cd server && env CGO_ENABLED=0 GOOS=linux GOARCH=arm64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -trimpath -o dist/plugin-linux-arm64;
	cd server && env CGO_ENABLED=0 GOOS=freebsd GOARCH=amd64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -trimpath -o dist/plugin-freebsd-amd64;
	cd server && env CGO_ENABLED=0 GOOS=openbsd GOARCH=amd64 $(GO) build $(GO_BUILD_FLAGS) -ldflags '$(LDFLAGS)' -trimpath -o dist/plugin-openbsd-amd64;
endif
endif

## Ensures NPM dependencies are installed without having to run this all the time.
webapp/node_modules: $(wildcard webapp/package.json)
ifneq ($(HAS_WEBAPP),)
	cd webapp && $(NPM) install
	touch $@
endif

standalone/node_modules: $(wildcard standalone/package.json)
ifneq ($(HAS_WEBAPP),)
	cd standalone && $(NPM) install
	touch $@
endif

e2e/node_modules: $(wildcard e2e/package.json)
ifneq ($(HAS_WEBAPP),)
	cd e2e && $(NPM) install
	touch $@
endif

## Builds the webapp, if it exists.
.PHONY: webapp
webapp: webapp/node_modules
ifneq ($(HAS_WEBAPP),)
ifeq ($(MM_DEBUG),)
	cd webapp && $(NPM) run build;
else
	cd webapp && $(NPM) run debug;
endif
endif

## Builds the standalone apps.
.PHONY: standalone
standalone: standalone/node_modules
ifeq ($(MM_DEBUG),)
	cd standalone && $(NPM) run build;
else
	cd standalone && $(NPM) run debug;
endif

## Generates a tar bundle of the plugin for install.
.PHONY: bundle
bundle:
	rm -rf dist/
	rm -rf webapp/dist/i18n
	rm -rf standalone/dist/i18n
	mkdir -p dist/$(PLUGIN_ID)
	./build/bin/manifest dist
ifneq ($(wildcard $(ASSETS_DIR)/.),)
	cp -r server/i18n $(ASSETS_DIR)/
	cp -r $(ASSETS_DIR) dist/$(PLUGIN_ID)/
endif
ifneq ($(HAS_PUBLIC),)
	cp -r public dist/$(PLUGIN_ID)/
endif
ifneq ($(HAS_SERVER),)
	mkdir -p dist/$(PLUGIN_ID)/server
	cp -r server/dist dist/$(PLUGIN_ID)/server/
endif
ifneq ($(HAS_WEBAPP),)
	mkdir -p dist/$(PLUGIN_ID)/webapp
	cp -r webapp/dist dist/$(PLUGIN_ID)/webapp/
	rm -fr standalone/dist/files/*.png
	mkdir dist/$(PLUGIN_ID)/standalone
	cp -r standalone/dist dist/$(PLUGIN_ID)/standalone/dist
endif
	cd dist && tar -cvzf $(BUNDLE_NAME) $(PLUGIN_ID)

	@echo plugin built at: dist/$(BUNDLE_NAME)

## Builds and bundles the plugin.
.PHONY: dist
dist:

ifeq ($(CI),true)
dist: apply server-ci webapp standalone bundle
else
dist: apply server webapp standalone bundle
endif

## Builds and installs the plugin to a server.
.PHONY: deploy
deploy: dist
	./build/bin/pluginctl deploy $(PLUGIN_ID) dist/$(BUNDLE_NAME)

## Builds and installs the plugin to a server, updating the webapp automatically when changed.
.PHONY: watch
watch: apply server bundle
ifeq ($(MM_DEBUG),)
	cd webapp && $(NPM) run build:watch
else
	cd webapp && $(NPM) run debug:watch
endif

## Installs a previous built plugin with updated webpack assets to a server.
.PHONY: deploy-from-watch
deploy-from-watch: bundle
	./build/bin/pluginctl deploy $(PLUGIN_ID) dist/$(BUNDLE_NAME)

## Setup dlv for attaching, identifying the plugin PID for other targets.
.PHONY: setup-attach
setup-attach:
	$(eval PLUGIN_PID := $(shell ps aux | grep "plugins/${PLUGIN_ID}" | grep -v "grep" | awk -F " " '{print $$2}'))
	$(eval NUM_PID := $(shell echo -n ${PLUGIN_PID} | wc -w))

	@if [ ${NUM_PID} -gt 2 ]; then \
		echo "** There is more than 1 plugin process running. Run 'make kill reset' to restart just one."; \
		exit 1; \
	fi

## Check if setup-attach succeeded.
.PHONY: check-attach
check-attach:
	@if [ -z ${PLUGIN_PID} ]; then \
		echo "Could not find plugin PID; the plugin is not running. Exiting."; \
		exit 1; \
	else \
		echo "Located Plugin running with PID: ${PLUGIN_PID}"; \
	fi

## Attach dlv to an existing plugin instance.
.PHONY: attach
attach: setup-attach check-attach
	dlv attach ${PLUGIN_PID}

## Attach dlv to an existing plugin instance, exposing a headless instance on $DLV_DEBUG_PORT.
.PHONY: attach-headless
attach-headless: setup-attach check-attach
	dlv attach ${PLUGIN_PID} --listen :$(DLV_DEBUG_PORT) --headless=true --api-version=2 --accept-multiclient

## Detach dlv from an existing plugin instance, if previously attached.
.PHONY: detach
detach: setup-attach
	@DELVE_PID=$(shell ps aux | grep "dlv attach ${PLUGIN_PID}" | grep -v "grep" | awk -F " " '{print $$2}') && \
	if [ "$$DELVE_PID" -gt 0 ] > /dev/null 2>&1 ; then \
		echo "Located existing delve process running with PID: $$DELVE_PID. Killing." ; \
		kill -9 $$DELVE_PID ; \
	fi

## Ensure gotestsum is installed and available as a tool for testing.
gotestsum:
	$(GO) install gotest.tools/gotestsum@v1.7.0

## Runs any lints and unit tests defined for the server and webapp, if they exist.
.PHONY: test
test:

ifeq ($(CI),true)
test: apply webapp/node_modules standalone/node_modules gotestsum
ifneq ($(HAS_SERVER),)
	$(GOBIN)/gotestsum --format standard-verbose --junitfile report.xml -- ./server/...
	cd ./server/public && $(GOBIN)/gotestsum -- -v $(GO_TEST_FLAGS) ./...
endif
ifneq ($(HAS_WEBAPP),)
	cd webapp && $(NPM) run test;
endif
else
test: apply webapp/node_modules standalone/node_modules gotestsum
ifneq ($(HAS_SERVER),)
	$(GOBIN)/gotestsum -- -v $(GO_TEST_FLAGS) ./server/...
	cd ./server/public && $(GOBIN)/gotestsum -- -v $(GO_TEST_FLAGS) ./...
	cd ./lt && $(GOBIN)/gotestsum -- -v $(GO_TEST_FLAGS) ./...
endif
ifneq ($(HAS_WEBAPP),)
	cd webapp && $(NPM) run test;
endif
ifneq ($(wildcard ./build/sync/plan/.),)
	cd ./build/sync && $(GOBIN)/gotestsum -- -v $(GO_TEST_FLAGS) ./...
endif
endif

## Creates a coverage report for the server code.
.PHONY: coverage
coverage: apply webapp/node_modules standalone/node_modules
ifneq ($(HAS_SERVER),)
	$(GO) test $(GO_TEST_FLAGS) -coverprofile=server/coverage.txt ./server/...
	$(GO) tool cover -html=server/coverage.txt
endif

## Runs e2e tests.
.PHONY: test-e2e
test-e2e: e2e/node_modules
	cd e2e && npm i && npx playwright test

## Runs e2e tests and updates snapshots.
.PHONY: test-e2e-update-snapshots
test-e2e-update-snapshots:
	cd e2e && npm i && npx playwright test --update-snapshots

## Extract strings for translation from the source code.
.PHONY: i18n-extract
i18n-extract:
	cd webapp && $(NPM) run extract
	cd standalone && $(NPM) run extract

	$(GO) install -modfile=go.tools.mod github.com/mattermost/mattermost-utilities/mmgotool
	cd server && $(GOBIN)/mmgotool i18n extract --portal-dir="" --skip-dynamic

## Disable the plugin.
.PHONY: disable
disable: detach
	./build/bin/pluginctl disable $(PLUGIN_ID)

## Enable the plugin.
.PHONY: enable
enable:
	./build/bin/pluginctl enable $(PLUGIN_ID)

## Reset the plugin, effectively disabling and re-enabling it on the server.
.PHONY: reset
reset: detach
	./build/bin/pluginctl reset $(PLUGIN_ID)

## Kill all instances of the plugin, detaching any existing dlv instance.
.PHONY: kill
kill: detach
	$(eval PLUGIN_PID := $(shell ps aux | grep "plugins/${PLUGIN_ID}" | grep -v "grep" | awk -F " " '{print $$2}'))

	@for PID in ${PLUGIN_PID}; do \
		echo "Killing plugin pid $$PID"; \
		kill -9 $$PID; \
	done; \

## Clean removes all build artifacts.
.PHONY: clean
clean:
	rm -fr dist/
ifneq ($(HAS_SERVER),)
	rm -fr server/coverage.txt
	rm -fr server/dist
endif
ifneq ($(HAS_WEBAPP),)
	rm -fr webapp/junit.xml
	rm -fr webapp/dist
	rm -fr webapp/node_modules
	rm -fr standalone/dist
	rm -fr standalone/node_modules
	rm -fr e2e/node_modules
endif
	rm -fr build/bin/
	rm -fr e2e/tests-results/

## Sync directory with a starter template
sync:
ifndef STARTERTEMPLATE_PATH
	@echo STARTERTEMPLATE_PATH is not set.
	@echo Set STARTERTEMPLATE_PATH to a local clone of https://github.com/mattermost/mattermost-plugin-starter-template and retry.
	@exit 1
endif
	cd ${STARTERTEMPLATE_PATH} && go run ./build/sync/main.go ./build/sync/plan.yml $(PWD)

## Create plugin server mock files
server-mocks:
	$(GO) install github.com/vektra/mockery/v2/...@v2.40.3
	$(GOBIN)/mockery

## To generate db migrations list
migrations-extract:
	@echo Listing migration files
	@echo "# Autogenerated file to synchronize migrations sequence in the PR workflow, please do not edit.\n#" > server/db/migrations/migrations.list
	find server/db/migrations -maxdepth 2 -mindepth 2 | sort >> server/db/migrations/migrations.list

# Help documentation à la https://marmelab.com/blog/2016/02/29/auto-documented-makefile.html
help:
	@cat Makefile build/*.mk | grep -v '\.PHONY' |  grep -v '\help:' | grep -B1 -E '^[a-zA-Z0-9_.-]+:.*' | sed -e "s/:.*//" | sed -e "s/^## //" |  grep -v '\-\-' | sed '1!G;h;$$!d' | awk 'NR%2{printf "\033[36m%-30s\033[0m",$$0;next;}1' | sort
