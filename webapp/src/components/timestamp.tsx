import {DateTime} from 'luxon';
import React, {useEffect, useState} from 'react';

type Props = {
    interval?: number,
    timestampFn?: () => string,
}

function getTimestamp() {
    return DateTime.utc().toFormat('yyyy-MM-dd HH:mm') + ' UTC';
}

export default function Timestamp({interval = 1000, timestampFn = getTimestamp}: Props) {
    // This is needed to force a re-render to periodically update
    // the time displayed.
    const [, updateState] = useState({});
    useEffect(() => {
        const timer = setInterval(() => updateState({}), interval);
        return () => clearInterval(timer);
    });

    return (<>{timestampFn()}</>);
}
