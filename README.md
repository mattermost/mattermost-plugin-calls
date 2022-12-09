# Mattermost Calls Plugin

A plugin that integrates real-time voice communication in Mattermost.

## Installation

1. Download the latest version from the [release page](https://github.com/mattermost/mattermost-plugin-calls/releases).
2. Upload the file through **System Console > Plugins > Plugin Management**, or manually upload it to the Mattermost server under plugin directory. See [documentation](https://docs.mattermost.com/administration/plugins.html#set-up-guide) for more details.

## Development

Use ```make dist``` to build this plugin.

Use `make deploy` to deploy the plugin to your local server.

For more details on how to develop a plugin refer to the official [documentation](https://developers.mattermost.com/extend/plugins/).

## Load testing

Refer to the load-test client [documentation](lt/) for information on how to simulate and load-test calls.

## License

See [LICENSE](LICENSE) and [LICENSE.enterprise](server/enterprise/LICENSE) for license rights and limitations.

