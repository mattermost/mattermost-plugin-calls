// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function ShareScreenIcon(props: Props) {
    return (
        <svg
            style={props.style}
            className={props.className}
            fill={props.fill}
            viewBox='1 2 22 20'
            role='img'
        >
            <path d='M23,4v12c0,0.6-0.2,1-0.6,1.5C22,17.8,21.5,18,21,18h-6v-2h6V4H3v12h6v2H3c-0.6,0-1-0.2-1.5-0.6C1.2,17,1,16.6,1,16V4 	c0-0.5,0.2-1,0.6-1.4C2,2.2,2.5,2,3,2h18c0.6,0,1,0.2,1.4,0.6C22.8,3,23,3.4,23,4z M13,13h3l-4-4l-4,4h3v7H8v2h8v-2h-3V13z'/>
        </svg>
    );
}
