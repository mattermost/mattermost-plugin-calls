// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function VideoOutlineIcon(props: Props) {
    return (
        <svg
            {...props}
            fill={props.fill || 'currentColor'}
            viewBox='2 1.9 20 19.1'
            role='img'
        >
            <path d='M18,10.5V7c0-1.3-0.7-2-2-2H4C2.8,5,2,5.8,2,7v10c0,1.2,0.9,2,2,2h12c1.3,0,2-0.8,2-2v-3.5l4,4v-11L18,10.5z M16,17H4V7h12V17z'/>
        </svg>
    );
}
