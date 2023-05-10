import {DateTime} from 'luxon';
import React, {CSSProperties, useState, useEffect} from 'react';

type Props = {
    style?: CSSProperties,
}

function getTimestamp() {
    return DateTime.utc().toFormat('YYYY-MM-DD HH:mm') + ' UTC';
}

export default function Timestamp(props: Props) {
    // This is needed to force a re-render to periodically update
    // the time displayed.
    const [, updateState] = useState({});
    useEffect(() => {
        const interval = setInterval(() => updateState({}), 1000);
        return () => clearInterval(interval);
    });

    const style = props.style || {};

    return (
        <div style={style}>{getTimestamp()}</div>
    );
}
