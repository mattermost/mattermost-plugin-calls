// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {RoomContext, VideoConference} from '@livekit/components-react';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import {Room, RoomEvent, RoomOptions, DisconnectReason} from 'livekit-client';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';

type GuestJoinResponse = {
    livekit_token: string;
    livekit_url: string;
    call_title: string;
    session_id: string;
};

function getTokenFromURL(): string {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
}

function getPluginPath(): string {
    // The guest app is served at /plugins/{pluginId}/public/standalone/guest.html
    // We need the plugin API base: /plugins/{pluginId}
    const match = window.location.pathname.match(/^(\/plugins\/[^/]+)\//);
    if (match) {
        return match[1];
    }
    return '/plugins/com.mattermost.calls';
}

function App() {
    const [secret] = useState(getTokenFromURL);
    const [displayName, setDisplayName] = useState('');
    const [joinResponse, setJoinResponse] = useState<GuestJoinResponse | null>(null);
    const [error, setError] = useState('');
    const [joining, setJoining] = useState(false);
    const [ended, setEnded] = useState(false);

    if (!secret) {
        return (
            <div style={styles.centered}>
                <div style={styles.card}>
                    <h2 style={styles.title}>{'Invalid Link'}</h2>
                    <p style={styles.text}>{'This guest link is missing a token. Please check the URL and try again.'}</p>
                </div>
            </div>
        );
    }

    if (ended) {
        return (
            <div style={styles.centered}>
                <div style={styles.card}>
                    <h2 style={styles.title}>{'Call Ended'}</h2>
                    <p style={styles.text}>{'You have left the call. You can close this window.'}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={styles.centered}>
                <div style={styles.card}>
                    <h2 style={styles.title}>{'Unable to Join'}</h2>
                    <p style={styles.text}>{error}</p>
                    <button
                        style={styles.button}
                        onClick={() => {
                            setError('');
                            setJoining(false);
                        }}
                    >
                        {'Try Again'}
                    </button>
                </div>
            </div>
        );
    }

    if (joinResponse) {
        return (
            <ActiveRoom
                joinResponse={joinResponse}
                displayName={displayName}
                onLeave={() => setEnded(true)}
            />
        );
    }

    const handleJoin = async () => {
        if (!displayName.trim()) {
            return;
        }

        setJoining(true);
        setError('');

        try {
            const resp = await fetch(`${getPluginPath()}/guest/join`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    secret,
                    display_name: displayName.trim(),
                }),
            });

            if (!resp.ok) {
                const body = await resp.json().catch(() => ({}));
                throw new Error(body.message || body.detailed_error || `Request failed (${resp.status})`);
            }

            const data: GuestJoinResponse = await resp.json();
            document.title = `Call - ${data.call_title || 'Guest'}`;
            setJoinResponse(data);
        } catch (err: any) {
            setError(err.message || 'Failed to join call');
            setJoining(false);
        }
    };

    return (
        <div style={styles.centered}>
            <div style={styles.card}>
                <h2 style={styles.title}>{'Join Call as Guest'}</h2>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleJoin();
                    }}
                >
                    <label
                        htmlFor='displayName'
                        style={styles.label}
                    >
                        {'Your name'}
                    </label>
                    <input
                        id='displayName'
                        type='text'
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder='Enter your name'
                        style={styles.input}
                        autoFocus={true}
                        maxLength={64}
                    />
                    <button
                        type='submit'
                        style={{
                            ...styles.button,
                            opacity: !displayName.trim() || joining ? 0.6 : 1,
                        }}
                        disabled={!displayName.trim() || joining}
                    >
                        {joining ? 'Joining...' : 'Join Call'}
                    </button>
                </form>
            </div>
        </div>
    );
}

function ActiveRoom({joinResponse, displayName, onLeave}: {
    joinResponse: GuestJoinResponse;
    displayName: string;
    onLeave: () => void;
}) {
    const roomOptions = useMemo((): RoomOptions => ({
        adaptiveStream: true,
        dynacast: true,
    }), []);

    const room = useMemo(() => new Room(roomOptions), [roomOptions]);

    const handleLeave = useCallback(() => {
        room.disconnect();
        onLeave();
    }, [room, onLeave]);

    useEffect(() => {
        room.connect(joinResponse.livekit_url, joinResponse.livekit_token, {autoSubscribe: true})
            .then(() => {
                room.localParticipant.setMicrophoneEnabled(true);
            })
            .catch((err) => {
                // eslint-disable-next-line no-console
                console.error('Failed to connect to LiveKit', err);
                onLeave();
            });

        const handleDisconnect = (reason?: DisconnectReason) => {
            if (reason !== DisconnectReason.CLIENT_INITIATED) {
                // eslint-disable-next-line no-console
                console.warn('LiveKit room disconnected unexpectedly', reason);
            }
            onLeave();
        };

        room.on(RoomEvent.Disconnected, handleDisconnect);

        const handleBeforeUnload = () => {
            room.disconnect();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            room.off(RoomEvent.Disconnected, handleDisconnect);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            room.disconnect();
        };
    }, [room, joinResponse, onLeave]);

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
    centered: {
        display: 'grid',
        placeItems: 'center',
        height: '100vh',
        background: '#111',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    card: {
        background: '#1e1e1e',
        borderRadius: '12px',
        padding: '40px',
        maxWidth: '400px',
        width: '90%',
        textAlign: 'center' as const,
    },
    title: {
        color: '#fff',
        margin: '0 0 16px',
        fontSize: '20px',
        fontWeight: 600,
    },
    text: {
        color: '#aaa',
        margin: '0 0 20px',
        fontSize: '14px',
        lineHeight: '1.5',
    },
    label: {
        display: 'block',
        color: '#ccc',
        fontSize: '14px',
        marginBottom: '8px',
        textAlign: 'left' as const,
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        fontSize: '14px',
        borderRadius: '6px',
        border: '1px solid #444',
        background: '#2a2a2a',
        color: '#fff',
        marginBottom: '16px',
        boxSizing: 'border-box' as const,
        outline: 'none',
    },
    button: {
        width: '100%',
        padding: '10px 16px',
        fontSize: '14px',
        fontWeight: 600,
        borderRadius: '6px',
        border: 'none',
        background: '#1b6bff',
        color: '#fff',
        cursor: 'pointer',
    },
    roomContainer: {
        height: '100vh',
    },
};

const root = createRoot(document.getElementById('root')!);
root.render(<App/>);
