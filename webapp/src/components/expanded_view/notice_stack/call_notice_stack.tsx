// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import './call_notice_stack.scss';

import {UserSessionState} from '@mattermost/calls-common/lib/types';
import AccountMinusOutlineIcon from '@mattermost/compass-icons/components/account-minus-outline';
import AccountPlusOutlineIcon from '@mattermost/compass-icons/components/account-plus-outline';
import HandRightOutlineIcon from '@mattermost/compass-icons/components/hand-right-outline';
import MinusCircleOutlineIcon from '@mattermost/compass-icons/components/minus-circle-outline';
import MonitorAccountIcon from '@mattermost/compass-icons/components/monitor-account';
import RecordCircleOutlineIcon from '@mattermost/compass-icons/components/record-circle-outline';
import {Icon} from '@mattermost/compass-ui/components/icon';
import classNames from 'classnames';
import {getCurrentUserId, getUsers} from 'mattermost-redux/selectors/entities/users';
import React, {useEffect, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {hostControlNoticesForCurrentCall, recordingForCurrentCall} from 'src/selectors';
import {sessionsInCurrentCallMap} from 'src/state/session/selectors';
import {HostControlNotice, HostControlNoticeType} from 'src/types/types';
import {getUserDisplayName} from 'src/utils';

import {prefersReducedMotion} from '../self_view/self_view_position';
import {
    addNotice,
    markLeaving,
    NOTICE_FADE_MS,
    NOTICE_TIMEOUT_MS,
    NoticeKind,
    removeNotice,
    StackNotice,
} from './notice_queue';

const NOTICE_ICONS: Record<NoticeKind, React.ComponentType> = {
    joined: AccountPlusOutlineIcon,
    left: AccountMinusOutlineIcon,
    hand: HandRightOutlineIcon,
    host: MonitorAccountIcon,
    removed: MinusCircleOutlineIcon,
    recording: RecordCircleOutlineIcon,
};

type Props = {
    currentSessionID?: string;
};

const NO_SESSIONS: Record<string, UserSessionState> = {};

let noticeCount = 0;

export default function CallNoticeStack({currentSessionID}: Props) {
    const {formatMessage} = useIntl();
    const sessions = useSelector(sessionsInCurrentCallMap) ?? NO_SESSIONS;

    // All profiles, not just the call's, so someone who just left still has a name.
    const profiles = useSelector(getUsers);
    const recording = useSelector(recordingForCurrentCall);
    const hostNotices = useSelector(hostControlNoticesForCurrentCall);
    const currentUserID = useSelector(getCurrentUserId);
    const [notices, setNotices] = useState<StackNotice[]>([]);

    const timeoutsRef = useRef<number[]>([]);
    const prevSessionsRef = useRef<Record<string, UserSessionState> | null>(null);
    const prevRecordingRef = useRef(recording);
    const seenHostNoticesRef = useRef(new Set(hostNotices.map((n) => n.noticeID)));

    useEffect(() => () => timeoutsRef.current.forEach((t) => window.clearTimeout(t)), []);

    const later = (fn: () => void, ms: number) => {
        timeoutsRef.current.push(window.setTimeout(fn, ms));
    };

    const fadeOut = (id: string) => {
        setNotices((current) => markLeaving(current, id));
        later(() => setNotices((current) => removeNotice(current, id)), prefersReducedMotion() ? 0 : NOTICE_FADE_MS);
    };

    const push = (kind: NoticeKind, message: string) => {
        noticeCount += 1;
        const id = `calls-notice-${noticeCount}`;
        setNotices((current) => addNotice(current, {id, kind, message, transient: true, leaving: false}));
        later(() => fadeOut(id), NOTICE_TIMEOUT_MS);
    };

    const nameFor = (session: UserSessionState) => getUserDisplayName(profiles[session.user_id]) || formatMessage({defaultMessage: 'Someone'});

    useEffect(() => {
        // Our own session marks the point where the call state is loaded; anyone already there didn't just join.
        if (!prevSessionsRef.current) {
            if (currentSessionID && sessions[currentSessionID]) {
                prevSessionsRef.current = sessions;
            }
            return;
        }

        const prev = prevSessionsRef.current;
        prevSessionsRef.current = sessions;
        Object.values(sessions).forEach((session) => {
            if (session.session_id === currentSessionID) {
                return;
            }
            const before = prev[session.session_id];
            if (!before) {
                push('joined', formatMessage({defaultMessage: '{name} joined the call'}, {name: nameFor(session)}));
            } else if (!before.raised_hand && session.raised_hand) {
                push('hand', formatMessage({defaultMessage: '{name} raised their hand'}, {name: nameFor(session)}));
            }
        });
        Object.values(prev).forEach((session) => {
            if (session.session_id !== currentSessionID && !sessions[session.session_id]) {
                push('left', formatMessage({defaultMessage: '{name} left the call'}, {name: nameFor(session)}));
            }
        });
    }, [sessions, currentSessionID]);

    useEffect(() => {
        const prev = prevRecordingRef.current;
        prevRecordingRef.current = recording;
        if (!prev?.start_at && recording?.start_at && !recording.end_at) {
            push('recording', formatMessage({defaultMessage: 'Recording started'}));
        } else if (prev?.start_at && !prev.end_at && recording?.end_at) {
            push('recording', formatMessage({defaultMessage: 'Recording stopped'}));
        }
    }, [recording]);

    const hostNoticeMessage = (notice: HostControlNotice): [NoticeKind, string] => {
        switch (notice.type) {
        case HostControlNoticeType.LowerHand:
            return ['hand', formatMessage({defaultMessage: '{host} lowered your hand'}, {host: notice.displayName})];
        case HostControlNoticeType.HostChanged:
            return ['host', notice.userID === currentUserID ? formatMessage({defaultMessage: 'You are now the host'}) : formatMessage({defaultMessage: '{name} is now the host'}, {name: notice.displayName})];
        case HostControlNoticeType.HostRemoved:
            return ['removed', formatMessage({defaultMessage: '{name} was removed from the call'}, {name: notice.displayName})];
        default: {
            const unhandled: never = notice.type;
            return unhandled;
        }
        }
    };

    useEffect(() => {
        hostNotices.forEach((notice) => {
            if (seenHostNoticesRef.current.has(notice.noticeID)) {
                return;
            }
            seenHostNoticesRef.current.add(notice.noticeID);
            push(...hostNoticeMessage(notice));
        });
    }, [hostNotices]);

    return (
        <ul
            className='CallNoticeStack'
            role='log'
            aria-live='polite'
            aria-label={formatMessage({defaultMessage: 'Call notifications'})}
            data-testid='calls-notice-stack'
        >
            {notices.map((notice) => {
                const NoticeIcon = NOTICE_ICONS[notice.kind];
                return (
                    <li
                        key={notice.id}
                        className={classNames('CallNoticeStack__notice', {
                            'CallNoticeStack__notice--leaving': notice.leaving,
                        })}
                        data-kind={notice.kind}
                    >
                        <Icon
                            size='16'
                            glyph={<NoticeIcon/>}
                        />
                        <span>{notice.message}</span>
                    </li>
                );
            })}
        </ul>
    );
}
