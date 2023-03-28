// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function UnshareScreenIcon(props: Props) {
    return (
        <svg
            style={props.style}
            className={props.className}
            fill={props.fill}
            viewBox='0 1.58 23 22.17'
            role='img'
        >
            <path d='M14,18v2h2v2H8v-2h2v-2H3c-1.105,0-2-0.895-2-2V4L0,3l1.41-1.42l20.75,20.76l-1.41,1.41L15,18H14 M3,16h10L3,6V16 M21,2 	c1.105,0,2,0.895,2,2v12c0,1.105-0.895,2-2,2h-0.34l-2-2H21V4H6.66l-2-2H21z'/>
        </svg>
    );
}
