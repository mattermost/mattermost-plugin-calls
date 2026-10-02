// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {GlobalState} from '@mattermost/types/store';
import {getChannel} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import {useEffect, useRef} from 'react';
import {useSelector} from 'react-redux';
import {PHONE_RINGBACK_TONE_TIMEOUT, RINGBACK_TONE_TIMEOUT} from 'src/constants';
import {
    callOwnerIDForCallInChannel,
    channelIDForCurrentCall,
    getCallIDForCurrentCall,
    isCurrentCallPhoneCall,
    isCurrentPhoneCallRinging,
    ringingEnabled,
    sessionsForOtherUsersInCall,
    sessionsInCurrentCall,
} from 'src/selectors';
import RingbackSound from 'src/sounds/ringback.mp3';
import {
    isDMChannel,
    playSound,
} from 'src/utils';

// useRingback plays an outbound ringback tone to the caller of a DM or phone
// call while they are waiting for the other party to answer. The tone is bundled
// directly in the plugin and played via a plain Audio element — independent of
// the incoming-ring infrastructure.
// The ringback stops as soon as the call is answered, the call ends, or the
// component unmounts. After the timeout the audio is stopped and the
// server-side timer handles the actual call cancellation.
//
// For a DM call "answered" means another user joined; the join sound is then
// played by the joinUser thunk. For a phone call it means the phone leg went
// active, which nothing else reacts to, so the join sound is played here. Phone
// calls always ring back, even when incoming ringing is turned off, since the
// browser is the only thing telling the caller the phone is ringing.
export const useRingbackTone = () => {
    const enabled = useSelector(ringingEnabled);
    const currentUser = useSelector(getCurrentUser);
    const connectedChannelID = useSelector(channelIDForCurrentCall);
    const callID = useSelector(getCallIDForCurrentCall);
    const channel = useSelector((state: GlobalState) => (connectedChannelID ? getChannel(state, connectedChannelID) : undefined));
    const ownerID = useSelector((state: GlobalState) => (connectedChannelID ? callOwnerIDForCallInChannel(state, connectedChannelID) : undefined));
    const otherSessionsCount = useSelector(sessionsForOtherUsersInCall).length;
    const isPhoneCall = useSelector(isCurrentCallPhoneCall);
    const isPhoneCallRinging = useSelector(isCurrentPhoneCallRinging);

    // Wait until our own session is in the call before starting the ringback so
    // we don't race with the handleUserJoined cleanup that silences incoming rings.
    const selfSessionPresent = useSelector((state: GlobalState) =>
        sessionsInCurrentCall(state).some((session) => session.user_id === currentUser.id));

    const amOwner = Boolean(callID) && ownerID === currentUser.id;
    const ringbackCall = isPhoneCall || (enabled && isDMChannel(channel));
    const active = Boolean(callID) && amOwner && ringbackCall && selfSessionPresent;
    const answered = isPhoneCall ? !isPhoneCallRinging : otherSessionsCount > 0;
    const timeout = isPhoneCall ? PHONE_RINGBACK_TONE_TIMEOUT : RINGBACK_TONE_TIMEOUT;

    // Track per-call audio state without triggering re-renders.
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handledCallRef = useRef<string | null>(null);
    const answeredCallRef = useRef<string | null>(null);

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
        } else if (answered) {
            // Someone answered — stop and mark this call as handled so we
            // don't re-ring if participants subsequently drop out.
            stopRingback();
            handledCallRef.current = callID;

            if (isPhoneCall && answeredCallRef.current !== callID) {
                answeredCallRef.current = callID;
                playSound('join_user');
            }
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

            timerRef.current = setTimeout(() => {
                if (!audioRef.current) {
                    return;
                }
                handledCallRef.current = callID;
                stopRingback();

                // Server-side timer handles the actual call cancellation.
            }, window.e2eRingLength ? window.e2eRingLength : timeout);
        }

        return () => stopRingback();
    }, [active, callID, answered, isPhoneCall, timeout]);
};
