# Mattermost Talk Plugin

A plugin that integrates real-time voice communication in Mattermost.

![image](https://user-images.githubusercontent.com/1832946/102091888-b2d2cd80-3e1f-11eb-9a07-021c949a03fe.png)

## Demo

A demo server running the latest version of this plugin is located [here](https://mm.krad.stream/talk/channels/town-square).  
You can login using the following details:

```
Username: demo
Password: password
```

## Todo

- Code cleanup & linting.
- Configuration.
- Proper [ICE](https://webrtcglossary.com/ice/) handling.
- [TURN](https://webrtcglossary.com/turn/) support.
- [HA](https://developers.mattermost.com/extend/plugins/server/ha/) support.

## Limitations

This plugin only works on web client and desktop app. Mobile native apps are **not** [supported](https://developers.mattermost.com/extend/plugins/mobile/).

## Installation

1. Download the latest version from the [release page](https://github.com/streamer45/mattermost-plugin-talk/releases).
2. Upload the file through **System Console > Plugins > Plugin Management**, or manually upload it to the Mattermost server under plugin directory. See [documentation](https://docs.mattermost.com/administration/plugins.html#set-up-guide) for more details.

## Development

Use ```make dist``` to build this plugin.

Use `make deploy` to deploy the plugin to your local server.

For more details on how to develop a plugin refer to the official [documentation](https://developers.mattermost.com/extend/plugins/).

## Acknowledgments

This couldn't have been possible without the **awesome** [Pion WebRTC API](https://github.com/pion/webrtc).  
Special thanks to [@isacikoz](https://github.com/isacikgoz) for offering his time to help testing this plugin.

## License

[mattermost-plugin-talk](https://github.com/streamer45/mattermost-plugin-talk) is licensed under [MIT](LICENSE)  
