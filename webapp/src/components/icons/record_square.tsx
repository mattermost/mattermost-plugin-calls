// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function RecordSqareIcon(props: Props) {
    return (
        <svg
            style={props.style}
            fill={props.fill}
            viewBox='2 2 20 20'
            role='img'
        >
            <path d='M12,20c-4.418,0-8-3.582-8-8s3.582-8,8-8s8,3.582,8,8S16.418,20,12,20 M12,2C6.477,2,2,6.477,2,12s4.477,10,10,10 	s10-4.477,10-10S17.523,2,12,2 M16,16H8V8h8V16z'/>
        </svg>
    );
}

