// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function TickIcon(props: Props) {
    return (
        <svg
            style={props.style}
            className={props.className}
            fill={props.fill}
            viewBox='1.63 3.19 13.12 10.06'
            role='img'
        >
            <path d='M14.75 4.2558L5.75 13.2558L1.628 9.1158L2.69 8.0718L5.75 11.1318L13.688 3.1938L14.75 4.2558Z'/>
        </svg>
    );
}
