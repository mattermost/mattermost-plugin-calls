// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {DisconnectReason, Room, RoomEvent} from 'livekit-client';
import React from 'react';
import ReactDOM from 'react-dom';

import LiveKitCallView from 'plugin/components/livekit_call_view';

declare global {
    interface Window {
        livekitRoom?: Room;
        livekitChannelID?: string;
    }
}

const CHANNEL_NAME = 'calls_livekit';

const bc = new BroadcastChannel(CHANNEL_NAME);
let leaving = false;

function sendLeave(channelID: string) {
    if (leaving) {
        return;
    }
    leaving = true;
    bc.postMessage({type: 'leave', channelID});
}

function handleLeave() {
    const channelID = window.livekitChannelID;
    if (window.livekitRoom) {
        window.livekitRoom.disconnect();
        delete window.livekitRoom;
    }
    if (channelID) {
        sendLeave(channelID);
        delete window.livekitChannelID;
    }
    window.close();
}

bc.onmessage = async (ev: MessageEvent) => {
    if (ev.data?.type === 'disconnect') {
        handleLeave();
        return;
    }

    if (ev.data?.type !== 'connect') {
        return;
    }

    const {channelID, channelName, token, url} = ev.data;

    try {
        const room = new Room({
            adaptiveStream: true,
            dynacast: true,
        });

        await room.connect(url, token);
        window.livekitRoom = room;
        window.livekitChannelID = channelID;

        document.title = `Call - ${channelName}`;

        await room.localParticipant.setMicrophoneEnabled(false);

        room.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
            if (reason !== DisconnectReason.CLIENT_INITIATED) {
                // eslint-disable-next-line no-console
                console.warn('LiveKit room disconnected unexpectedly', reason);
            }
            handleLeave();
        });

        ReactDOM.render(
            <LiveKitCallView
                channelID={channelID}
                channelName={channelName}
                onLeave={handleLeave}
            />,
            document.getElementById('root'),
        );
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to connect to LiveKit', err);
        if (channelID) {
            sendLeave(channelID);
        }
        window.close();
    }
};

window.addEventListener('beforeunload', () => {
    handleLeave();
});

// Signal to the main window that we're ready to receive connection details.
bc.postMessage({type: 'ready'});
