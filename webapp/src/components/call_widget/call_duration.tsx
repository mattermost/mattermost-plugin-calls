import {Duration} from 'luxon';
import React, {CSSProperties, useEffect, useState} from 'react';

type Props = {
    startAt: number,
    style?: CSSProperties,
}

const oneHour = Duration.fromObject({hours: 1});

function getCallDuration(startAt: number) {
    const dur = Duration.fromMillis(Date.now() - startAt);
    if (dur < oneHour) {
        return dur.toFormat('mm:ss');
    }
    return dur.toFormat('hh:mm:ss');
}

export default function CallDuration(props: Props) {
    // This is needed to force a re-render to periodically update
    // the time displayed.
    const [, updateState] = useState({});
    useEffect(() => {
        const interval = setInterval(() => updateState({}), 500);
        return () => clearInterval(interval);
    });

    const style = props.style || {};
    if (!style.fontWeight) {
        style.fontWeight = 600;
    }

    return (
        <div style={style}>{getCallDuration(props.startAt)}</div>
    );
}
