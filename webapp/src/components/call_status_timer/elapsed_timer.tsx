// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Duration} from 'luxon';
import React, {useEffect, useState} from 'react';

type Props = {
    startAt: number,
}

const oneHour = Duration.fromObject({hours: 1});

function getCallDuration(startAt: number) {
    const dur = Duration.fromMillis(Date.now() - startAt);
    if (dur < oneHour) {
        return dur.toFormat('mm:ss');
    }
    return dur.toFormat('hh:mm:ss');
}

export function ElapsedTimer(props: Props) {
    // If the server clock is ahead of the client, startAt will be in the
    // future and the raw duration would be negative. Capture an adjusted
    // start time on mount so the timer counts up from 0:00 immediately
    // rather than displaying negative values or sticking at 0.
    // Re-sync if the prop changes (e.g. after a WebSocket reconnect).
    const [adjustedStartAt, setAdjustedStartAt] = useState(() => Math.min(props.startAt, Date.now()));
    useEffect(() => {
        setAdjustedStartAt(Math.min(props.startAt, Date.now()));
    }, [props.startAt]);

    // This is needed to force a re-render to periodically update
    // the time displayed.
    const [, updateState] = useState({});
    useEffect(() => {
        const interval = setInterval(() => updateState({}), 500);
        return () => clearInterval(interval);
    });

    return (
        <div className='callDurationContainer'>{getCallDuration(adjustedStartAt)}</div>
    );
}
