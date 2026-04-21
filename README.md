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
[Configuration settings](https://docs.mattermost.com/configure/plugins-configuration-settings.html#calls)

## Development

### Requirements

#### GoLang
Check `go.mod` for the required GoLang version.

#### Node.js
Check `.nvmrc` for the required Node.js version. It is recommended to use [nvm](https://github.com/nvm-sh/nvm) for Node version management. Run `nvm use` in the project root to automatically switch to the required version.

### Building

Use `make deploy` to build and deploy the plugin to your local Mattermost server. Set `MM_SERVICESETTINGS_ENABLEDEVELOPER` so the build automatically detects and targets your native OS and architecture:

```bash
MM_SERVICESETTINGS_ENABLEDEVELOPER=true make deploy
```

Without this flag, the build only produces binaries for Linux, FreeBSD, and OpenBSD.

*Note:* If the upload fails with a file size error, increase the maximum file size in *System Console → Environment → File Storage → Maximum File Size* (e.g. 256 MB).

For more details on how to develop a plugin refer to the official [documentation](https://developers.mattermost.com/extend/plugins/).

### Testing the RTC client against a local LiveKit server

The `RTCClient` wrapper in `webapp/src/rtc_client/` connects to a LiveKit room using a JWT fetched from the plugin's `/livekit-token` endpoint. For local development you can run LiveKit in Docker and point the plugin at it — the rest of the flow (token minting, channel permission check, wrapper connect) is exercised end-to-end with no code changes.

#### 1. Start LiveKit in Docker

From the repo root:

```bash
export LIVEKIT_NODE_IP=127.0.0.1
docker compose -f docker-compose.livekit.yaml up
```

This brings up `livekit/livekit-server` using `livekit.yaml`:
- Signaling URL: `ws://localhost:7880`
- API key: `devkey`
- API secret: `secret`

#### 2. Configure the plugin to use it

In the Mattermost System Console (**Plugins → Calls**), or directly in `config.json` under `PluginSettings.Plugins["com.mattermost.calls"]`, set:

| Field | Value |
|---|---|
| LiveKit URL | `ws://localhost:7880` |
| LiveKit API Key | `devkey` |
| LiveKit API Secret | `secret` |

#### 3. Build and deploy the plugin

```bash
MM_SERVICESETTINGS_ENABLEDEVELOPER=true make deploy
```

#### 4. Exercise the wrapper

With both LiveKit Docker and the plugin running, the `RTCClient` wrapper will fetch a token from `/livekit-token` and connect to the Docker LiveKit server. From the browser console on a logged-in Mattermost tab:

```js
const { default: RTCClient } = await import('/static/plugins/com.mattermost.calls/.../rtc_client'); // path depends on bundler output
const client = new RTCClient();
client.on('connect', () => console.log('connected'));
client.on('close', (reason) => console.log('disconnected', reason));
client.on('error', (err) => console.error('rtc error', err));
await client.connect('<channel-id>');
```

Open a second browser/tab as a different user in the same channel and repeat — both clients will land in the same LiveKit room (room name = channel ID) and see each other as remote participants on `client.room`.

> **Note:** `devkey`/`secret` from `livekit.yaml` are for local development only. Never use these credentials with a LiveKit server exposed to the internet.

## How to Release

Use `make dist` to build a release bundle.

To trigger a release, follow these steps:

1. **For Patch Release:** Run the following command:

    ```bash
    make patch
    ```

   This will release a patch change.

2. **For Minor Release:** Run the following command:

    ```bash
    make minor
    ```

   This will release a minor change.

3. **For Major Release:** Run the following command:

    ```bash
    make major
    ```

   This will release a major change.

4. **For Patch Release Candidate (RC):** Run the following command:

    ```bash
    make patch-rc
    ```

   This will release a patch release candidate.

5. **For Minor Release Candidate (RC):** Run the following command:

    ```bash
    make minor-rc
    ```

   This will release a minor release candidate.

6. **For Major Release Candidate (RC):** Run the following command:

    ```bash
    make major-rc
    ```

   This will release a major release candidate.

## Load testing

Refer to the load-test client [documentation](lt/) for information on how to simulate and load-test calls.

## Get involved

Please join the [Developers: Calls](https://community.mattermost.com/core/channels/developers-channel-call) channel to discuss any topic related to this project.

## License

See [LICENSE.txt](LICENSE.txt) and [LICENSE.enterprise](server/enterprise/LICENSE) for license rights and limitations.
