// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useEffect, useState, useCallback} from 'react';
import {Room, RoomEvent, Participant, Track} from 'livekit-client';

import ParticipantTile from './participant_tile';
import ScreenShareTile from './screen_share_tile';

interface Props {
    channelID: string;
    channelName: string;
    onLeave: () => void;
}

const LiveKitCallView: React.FC<Props> = ({channelID, channelName, onLeave}) => {
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [isMuted, setIsMuted] = useState(true);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    const updateParticipants = useCallback(() => {
        const room = window.livekitRoom;
        if (!room) {
            return;
        }
        const allParticipants: Participant[] = [
            room.localParticipant,
            ...Array.from(room.remoteParticipants.values()),
        ];
        setParticipants(allParticipants);

        // Sync local screen share state in case the browser's native "Stop sharing"
        // button was used (which ends the track without going through our toggle).
        setIsScreenSharing(room.localParticipant.isScreenShareEnabled);
    }, []);

    useEffect(() => {
        const room = window.livekitRoom;
        if (!room) {
            return;
        }

        const events = [
            RoomEvent.ParticipantConnected,
            RoomEvent.ParticipantDisconnected,
            RoomEvent.TrackSubscribed,
            RoomEvent.TrackUnsubscribed,
            RoomEvent.TrackMuted,
            RoomEvent.TrackUnmuted,
            RoomEvent.LocalTrackPublished,
            RoomEvent.LocalTrackUnpublished,
        ];

        for (const event of events) {
            room.on(event, updateParticipants);
        }

        room.on(RoomEvent.Disconnected, () => {
            onLeave();
        });

        // Initial population
        updateParticipants();

        return () => {
            for (const event of events) {
                room.off(event, updateParticipants);
            }
        };
    }, [updateParticipants, onLeave]);

    const toggleMute = useCallback(async () => {
        const room = window.livekitRoom;
        if (!room) {
            return;
        }
        const newMuted = !isMuted;
        await room.localParticipant.setMicrophoneEnabled(!newMuted);
        setIsMuted(newMuted);
    }, [isMuted]);

    const toggleCamera = useCallback(async () => {
        const room = window.livekitRoom;
        if (!room) {
            return;
        }
        const newCameraOn = !isCameraOn;
        await room.localParticipant.setCameraEnabled(newCameraOn);
        setIsCameraOn(newCameraOn);
    }, [isCameraOn]);

    const toggleScreenShare = useCallback(async () => {
        const room = window.livekitRoom;
        if (!room) {
            return;
        }
        const newSharing = !isScreenSharing;
        await room.localParticipant.setScreenShareEnabled(newSharing);
        setIsScreenSharing(newSharing);
    }, [isScreenSharing]);

    // Find participants who are screen sharing
    const screenSharers = participants.filter((p) => p.isScreenShareEnabled);

    const getGridStyle = (): React.CSSProperties => {
        const count = participants.length;
        if (count <= 1) {
            return {...styles.grid, gridTemplateColumns: '1fr'};
        }
        if (count <= 4) {
            return {...styles.grid, gridTemplateColumns: 'repeat(2, 1fr)'};
        }
        return {...styles.grid, gridTemplateColumns: 'repeat(3, 1fr)'};
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.header}>
                <span style={styles.headerTitle}>
                    {'Call in #'}{channelName}
                </span>
                <span style={styles.headerInfo}>
                    {participants.length}{' participant(s)'}
                </span>
            </div>
            <div style={styles.content}>
                {screenSharers.length > 0 && (
                    <div style={styles.screenShareArea}>
                        {screenSharers.map((p) => (
                            <ScreenShareTile
                                key={`screen-${p.sid}`}
                                participant={p}
                                isLocal={p === window.livekitRoom?.localParticipant}
                            />
                        ))}
                    </div>
                )}
                <div style={screenSharers.length > 0 ? styles.sidebarGrid : getGridStyle()}>
                    {participants.map((p) => (
                        <ParticipantTile
                            key={p.sid}
                            participant={p}
                            isLocal={p === window.livekitRoom?.localParticipant}
                        />
                    ))}
                </div>
            </div>
            <div style={styles.controls}>
                <button
                    onClick={toggleMute}
                    style={isMuted ? styles.controlBtnActive : styles.controlBtn}
                >
                    {isMuted ? 'Unmute' : 'Mute'}
                </button>
                <button
                    onClick={toggleCamera}
                    style={isCameraOn ? styles.controlBtn : styles.controlBtnActive}
                >
                    {isCameraOn ? 'Camera Off' : 'Camera On'}
                </button>
                <button
                    onClick={toggleScreenShare}
                    style={isScreenSharing ? styles.screenShareBtnActive : styles.controlBtn}
                >
                    {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
                </button>
                <button
                    onClick={onLeave}
                    style={styles.leaveBtn}
                >
                    {'Leave'}
                </button>
            </div>
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#111',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        backgroundColor: '#1a1a1a',
        borderBottom: '1px solid #333',
    },
    headerTitle: {
        color: 'white',
        fontSize: '16px',
        fontWeight: 600,
    },
    headerInfo: {
        color: '#aaa',
        fontSize: '14px',
    },
    content: {
        flex: 1,
        display: 'flex',
        flexDirection: 'row',
        overflow: 'hidden',
    },
    screenShareArea: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        gap: '8px',
    },
    grid: {
        flex: 1,
        display: 'grid',
        gap: '8px',
        padding: '16px',
        alignContent: 'center',
        justifyContent: 'center',
        overflow: 'auto',
    },
    sidebarGrid: {
        width: '240px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '8px',
        overflow: 'auto',
    },
    controls: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '12px',
        padding: '16px',
        backgroundColor: '#1a1a1a',
        borderTop: '1px solid #333',
    },
    controlBtn: {
        padding: '10px 24px',
        borderRadius: '20px',
        border: 'none',
        backgroundColor: '#333',
        color: 'white',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
    },
    controlBtnActive: {
        padding: '10px 24px',
        borderRadius: '20px',
        border: 'none',
        backgroundColor: '#555',
        color: 'white',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
    },
    screenShareBtnActive: {
        padding: '10px 24px',
        borderRadius: '20px',
        border: 'none',
        backgroundColor: '#1B8A3E',
        color: 'white',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
    },
    leaveBtn: {
        padding: '10px 24px',
        borderRadius: '20px',
        border: 'none',
        backgroundColor: '#D24B4E',
        color: 'white',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
    },
};

export default LiveKitCallView;
