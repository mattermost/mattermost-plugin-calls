// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import {useEffect, useRef} from 'react';
import {useSelector} from 'react-redux';
import {RINGBACK_TONE_TIMEOUT} from 'src/constants';
import {
    callOwnerIDForCallInChannel,
    channelIDForCurrentCall,
    getCallIDForCurrentCall,
    ringingEnabled,
    sessionsForOtherUsersInCall,
    sessionsInCurrentCall,
} from 'src/selectors';
import RingbackSound from 'src/sounds/ringback.mp3';
import {
    isDMChannel,
} from 'src/utils';

// useRingback plays an outbound ringback tone to the caller of a DM call
// while they are waiting for the other party to answer. The tone is bundled
// directly in the plugin and played via a plain Audio element — independent of
// the incoming-ring infrastructure.
// The ringback stops as soon as another user joins, the call ends, or the
// component unmounts. After RINGBACK_TONE_TIMEOUT the audio is stopped and the
// server-side timer handles the actual call cancellation.
export const useRingbackTone = () => {
    const enabled = useSelector(ringingEnabled);
    const currentUser = useSelector(getCurrentUser);
    const connectedChannelID = useSelector(channelIDForCurrentCall);
    const callID = useSelector(getCallIDForCurrentCall);
    const channel = useSelector((state: GlobalState) => (connectedChannelID ? getChannel(state, connectedChannelID) : undefined));
    const ownerID = useSelector((state: GlobalState) => (connectedChannelID ? callOwnerIDForCallInChannel(state, connectedChannelID) : undefined));
    const otherSessionsCount = useSelector(sessionsForOtherUsersInCall).length;

    // Wait until our own session is in the call before starting the ringback so
    // we don't race with the handleUserJoined cleanup that silences incoming rings.
    const selfSessionPresent = useSelector((state: GlobalState) =>
        sessionsInCurrentCall(state).some((session) => session.user_id === currentUser.id));

    const amOwner = Boolean(callID) && ownerID === currentUser.id;
    const active = enabled && Boolean(callID) && amOwner && isDMChannel(channel) && selfSessionPresent;

    // Track per-call audio state without triggering re-renders.
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handledCallRef = useRef<string | null>(null);

    useEffect(() => {
        const stopRingback = () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
        };

        if (!active || !callID) {
            stopRingback();
        } else if (otherSessionsCount > 0) {
            // Someone answered — stop and mark this call as handled so we
            // don't re-ring if participants subsequently drop out.
            stopRingback();
            handledCallRef.current = callID;
        } else if (handledCallRef.current !== callID && !audioRef.current) {
            const audio = new Audio(RingbackSound);
            audio.loop = true;
            const outputDeviceID = window.callsClient?.currentAudioOutputDevice?.deviceId;
            if (outputDeviceID && typeof (audio as HTMLAudioElement & {setSinkId?: (id: string) => Promise<void>}).setSinkId === 'function') {
                // @ts-ignore - setSinkId is an experimental feature
                audio.setSinkId(outputDeviceID).catch(() => { /* best-effort */ });
            }
            audioRef.current = audio;
            audio.play().catch(() => {
                // Autoplay blocked — ringback is best-effort.
                if (audioRef.current === audio) {
                    audioRef.current = null;
                }
            });

            const timeout = window.e2eRingLength ? window.e2eRingLength : RINGBACK_TONE_TIMEOUT;
            timerRef.current = setTimeout(() => {
                if (!audioRef.current) {
                    return;
                }
                handledCallRef.current = callID;
                stopRingback();

                // Server-side timer handles the actual call cancellation.
            }, timeout);
        }

        return () => stopRingback();
    }, [active, callID, otherSessionsCount]);
};