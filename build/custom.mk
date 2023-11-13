# Include custom targets and environment variables here

## Generate mocks.
mocks:
ifneq ($(HAS_SERVER),)
	$(GO) install go.uber.org/mock/mockgen@v0.3.0
	mockgen -destination=server/mocks/mock_simpleclient.go -source=server/utils.go SimpleClient
endif
