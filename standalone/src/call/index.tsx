// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {PreJoin, RoomContext, VideoConference} from '@livekit/components-react';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import {LocalUserChoices} from '@livekit/components-react';
import {Room, RoomEvent, RoomOptions, DisconnectReason} from 'livekit-client';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';

const CHANNEL_NAME = 'calls_livekit';

const bc = new BroadcastChannel(CHANNEL_NAME);
let leaving = false;

type ConnectionInfo = {
    channelID: string;
    channelName: string;
    token: string;
    url: string;
};

function sendLeave(channelID: string) {
    if (leaving) {
        return;
    }
    leaving = true;
    bc.postMessage({type: 'leave', channelID});
}

function App() {
    const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
    const [userChoices, setUserChoices] = useState<LocalUserChoices | null>(null);

    useEffect(() => {
        const handler = (ev: MessageEvent) => {
            if (ev.data?.type === 'disconnect') {
                window.close();
                return;
            }
            if (ev.data?.type === 'connect') {
                const {channelID, channelName, token, url} = ev.data;
                setConnectionInfo({channelID, channelName, token, url});
                document.title = `Join - ${channelName}`;
            }
        };
        bc.onmessage = handler;
        bc.postMessage({type: 'ready'});

        return () => {
            bc.onmessage = null;
        };
    }, []);

    const handlePreJoinSubmit = useCallback((values: LocalUserChoices) => {
        setUserChoices(values);
    }, []);

    if (!connectionInfo) {
        return (
            <div style={styles.loading}>
                <span>{'Connecting...'}</span>
            </div>
        );
    }

    if (!userChoices) {
        return (
            <div
                style={styles.preJoinContainer}
                data-lk-theme='default'
            >
                <PreJoin
                    defaults={{videoEnabled: true, audioEnabled: true, username: ''}}
                    onSubmit={handlePreJoinSubmit}
                    userLabel='Display name'
                />
            </div>
        );
    }

    return (
        <ActiveRoom
            connectionInfo={connectionInfo}
            userChoices={userChoices}
        />
    );
}

function ActiveRoom({connectionInfo, userChoices}: {connectionInfo: ConnectionInfo; userChoices: LocalUserChoices}) {
    const roomOptions = useMemo((): RoomOptions => ({
        audioCaptureDefaults: {
            deviceId: userChoices.audioDeviceId || undefined,
        },
        videoCaptureDefaults: {
            deviceId: userChoices.videoDeviceId || undefined,
        },
        adaptiveStream: true,
        dynacast: true,
    }), [userChoices.audioDeviceId, userChoices.videoDeviceId]);

    const room = useMemo(() => new Room(roomOptions), [roomOptions]);

    const handleLeave = useCallback(() => {
        room.disconnect();
        sendLeave(connectionInfo.channelID);
        window.close();
    }, [room, connectionInfo.channelID]);

    useEffect(() => {
        document.title = `Call - ${connectionInfo.channelName}`;

        room.connect(connectionInfo.url, connectionInfo.token, {autoSubscribe: true})
            .then(() => {
                if (userChoices.audioEnabled) {
                    room.localParticipant.setMicrophoneEnabled(true);
                }
                if (userChoices.videoEnabled) {
                    room.localParticipant.setCameraEnabled(true);
                }
            })
            .catch((err) => {
                // eslint-disable-next-line no-console
                console.error('Failed to connect to LiveKit', err);
                sendLeave(connectionInfo.channelID);
                window.close();
            });

        const handleDisconnect = (reason?: DisconnectReason) => {
            if (reason !== DisconnectReason.CLIENT_INITIATED) {
                // eslint-disable-next-line no-console
                console.warn('LiveKit room disconnected unexpectedly', reason);
            }
            sendLeave(connectionInfo.channelID);
            window.close();
        };

        room.on(RoomEvent.Disconnected, handleDisconnect);

        const handleBeforeUnload = () => {
            room.disconnect();
            sendLeave(connectionInfo.channelID);
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Listen for disconnect command from main window
        bc.onmessage = (ev: MessageEvent) => {
            if (ev.data?.type === 'disconnect') {
                room.disconnect();
            }
        };

        return () => {
            room.off(RoomEvent.Disconnected, handleDisconnect);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            room.disconnect();
        };
    }, [room, connectionInfo, userChoices]);

    return (
        <div
            className='lk-room-container'
            style={styles.roomContainer}
            data-lk-theme='default'
        >
            <RoomContext.Provider value={room}>
                <VideoConference onLeave={handleLeave}/>
            </RoomContext.Provider>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    loading: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        background: '#111',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    preJoinContainer: {
        display: 'grid',
        placeItems: 'center',
        height: '100vh',
        background: '#111',
    },
    roomContainer: {
        height: '100vh',
    },
};

const root = createRoot(document.getElementById('root')!);
root.render(<App/>);
