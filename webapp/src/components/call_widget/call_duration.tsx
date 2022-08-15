import React, {CSSProperties, useState, useEffect} from 'react';
import moment from 'moment-timezone';

type Props = {
    startAt: number,
    style?: CSSProperties,
}

function getCallDuration(startAt: number) {
    const dur = moment.utc(moment().diff(moment(startAt)));
    if (dur.hours() === 0) {
        return dur.format('mm:ss');
    }
    return dur.format('HH:mm:ss');
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
