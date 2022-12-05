# Mattermost Calls

![calls_screen](https://user-images.githubusercontent.com/1832946/205749357-1f2d5af3-cfe7-4352-b1f2-953a31d91fca.png)

Calls enables voice calling and screen sharing functionality in Mattermost channels.

## Installation

1. Download the latest version from the [release page](https://github.com/mattermost/mattermost-plugin-calls/releases).
2. Upload the file through **System Console > Plugins > Plugin Management**, or manually upload it to the Mattermost server under plugin directory. 
3. Configure and enable the plugin.

## Requirements

This plugin demands some network configuration changes to allow audio/video communication between clients, such as opening network ports. Please refer to the [documentation](https://docs.mattermost.com/configure/calls-deployment.html#network) for more details.

## Documentation

[End-user documentation](https://docs.mattermost.com/channels/make-calls.html)  
[Calls self-hosted deployment](https://docs.mattermost.com/configure/calls-deployment.html)  
[Configuration settings](https://docs.mattermost.com/configure/plugins-configuration-settings.html#calls-beta)  

## Development

Use ```make dist``` to build this plugin.

Use `make deploy` to deploy the plugin to your local server.

For more details on how to develop a plugin refer to the official [documentation](https://developers.mattermost.com/extend/plugins/).

## Get involved

Please join the [Developers: Calls](https://community.mattermost.com/core/channels/developers-channel-call) channel to discuss any topic related to this project.

## License

See [LICENSE](LICENSE) and [LICENSE.enterprise](server/enterprise/LICENSE) for license rights and limitations.

