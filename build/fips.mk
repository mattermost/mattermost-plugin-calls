# FIPS-compliant Linux/amd64 build. Linux/amd64 is the only platform
# mattermost-server's FIPS release path supports. The presence of this file is
# what opts the plugin into FIPS builds in the delivery-platform release pipeline.

# Go FIPS toolchain image. Its Go version must satisfy the go directive in
# go.mod. To bump: set the new tag without a digest, let the dist-fips CI job
# pull it, then pin the digest CI resolves. Listing tags needs CI's Chainguard
# credentials; temporarily add this recipe line to server-fips:
#   CREDS=$$(printf 'cgr.dev' | docker-credential-cgr get); \
#   TOKEN=$$(curl -s -u "$$(echo $$CREDS | jq -r .Username):$$(echo $$CREDS | jq -r .Secret)" \
#     "https://cgr.dev/token?scope=repository:mattermost.com/go-openssl-fips:pull" | jq -r .token); \
#   curl -s -H "Authorization: Bearer $$TOKEN" "https://cgr.dev/v2/mattermost.com/go-openssl-fips/tags/list"
FIPS_IMAGE ?= cgr.dev/mattermost.com/go-openssl-fips:1.27.3@sha256:c46026540486f7da36274a761cecad22065ff10fc6f6f4136cef8a0b7122e060
BUNDLE_NAME_FIPS ?= $(PLUGIN_ID)-$(PLUGIN_VERSION)-fips.tar.gz
FIPS_BIN := server/dist-fips/plugin-linux-amd64-fips

# Must stay free of spaces and quotes: it is substituted into the single-quoted
# script below. No -s -w either, since verify-fips needs the symbol table.
FIPS_GO_BUILD_LDFLAGS ?= -ldflags=-X=main.buildHash=$(BUILD_HASH)

# GOTOOLCHAIN=local makes the build fail instead of silently downloading a
# non-FIPS upstream toolchain when the image's Go is older than go.mod requires.
## Builds the FIPS server binary for linux-amd64 inside the Go FIPS toolchain image.
.PHONY: server-fips
server-fips: setup-go-work manifest-check
	mkdir -p server/dist-fips
	docker run --rm \
	  --platform=linux/amd64 \
	  --entrypoint="" \
	  -v $(PWD):/plugin \
	  -w /plugin/server \
	  $(FIPS_IMAGE) \
	  /bin/sh -c 'CGO_ENABLED=1 GOOS=linux GOARCH=amd64 GOFIPS140=certified GOTOOLCHAIN=local \
	    go build -trimpath -buildvcs=false \
	    $(GO_BUILD_FLAGS) $(FIPS_GO_BUILD_LDFLAGS) \
	    -o dist-fips/plugin-linux-amd64-fips'

# Extra `go test` flags, e.g. FIPS_GO_TEST_FLAGS=-run=TestName. Same quoting
# constraint as FIPS_GO_BUILD_LDFLAGS.
FIPS_GO_TEST_FLAGS ?=

# The DB tests start Postgres through testcontainers, so the container needs
# the host's Docker socket, and host networking to reach the mapped ports.
## Runs the server Go tests built with the Go FIPS toolchain.
.PHONY: test-fips
test-fips: setup-go-work apply
	docker run --rm \
	  --platform=linux/amd64 \
	  --entrypoint="" \
	  --network=host \
	  -v /var/run/docker.sock:/var/run/docker.sock \
	  -e TESTCONTAINERS_HOST_OVERRIDE=localhost \
	  -v $(PWD):/plugin \
	  -w /plugin \
	  $(FIPS_IMAGE) \
	  /bin/sh -c 'CGO_ENABLED=1 GOFIPS140=certified GOTOOLCHAIN=local \
	    go test -buildvcs=false -count=1 $(FIPS_GO_TEST_FLAGS) \
	    ./server/... ./server/public/...'

# GOFIPS140=certified is recorded as the resolved module version; compare it to
# the toolchain's certified.txt so "inprocess", "latest" and "off" builds are
# rejected. Each check is its own recipe line so a failure exits non-zero.
## Verifies the FIPS server binary was built against the certified FIPS module and OpenSSL.
.PHONY: verify-fips
verify-fips:
	@test -f $(FIPS_BIN) || (echo "verify-fips: $(FIPS_BIN) not built" && exit 1)
	$(GO) version -m $(FIPS_BIN) | grep -qxE "[[:space:]]*build[[:space:]]+GOFIPS140=$$(cat "$$($(GO) env GOROOT)/lib/fips140/certified.txt")" || (echo "ERROR: not built against the certified GOFIPS140 module" && exit 1)
	$(GO) version -m $(FIPS_BIN) | grep -E "build[[:space:]]+DefaultGODEBUG=" | grep -qE "(^|[=,])fips140=on(,|$$)" || (echo "ERROR: missing DefaultGODEBUG fips140=on" && exit 1)
	$(GO) version -m $(FIPS_BIN) | grep -qE "build[[:space:]]+microsoft_systemcrypto=1" || (echo "ERROR: missing microsoft_systemcrypto=1" && exit 1)
	$(GO) tool nm $(FIPS_BIN) | grep -qE "func_go_openssl_OpenSSL_version|_mkcgo_OpenSSL_version" || (echo "ERROR: missing OpenSSL integration" && exit 1)
	@echo "verify-fips: OK"

# Depends on verify-fips so a direct `make bundle-fips` can't package an
# unverified binary.
## Generates the FIPS tar bundle in dist-fips/.
.PHONY: bundle-fips
bundle-fips: verify-fips
	rm -rf server/dist-fips-staged
	mkdir -p server/dist-fips-staged
	cp $(FIPS_BIN) server/dist-fips-staged/plugin-linux-amd64
	$(MAKE) bundle BUNDLE_DIR=dist-fips BUNDLE_NAME=$(BUNDLE_NAME_FIPS) SERVER_DIST_SRC=server/dist-fips-staged

## Builds and bundles the FIPS plugin (linux-amd64 only).
.PHONY: dist-fips
dist-fips: apply server-fips verify-fips webapp standalone bundle-fips

# Flat prerequisite list so apply, webapp and standalone run once, not twice.
## Builds and bundles both the regular and the FIPS plugin.
.PHONY: dist-all
dist-all: apply webapp standalone server server-fips verify-fips bundle bundle-fips
