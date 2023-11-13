# Include custom targets and environment variables here

## Generate mocks.
mocks:
ifneq ($(HAS_SERVER),)
	$(GO) install go.uber.org/mock/mockgen@v0.3.0
	mockgen -source=server/simplehttp/client.go -destination=server/simplehttp/mocks/mock_client.go SimpleClient
endif
