// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function SpeakerViewIcon(props: Props) {
    return (
        <svg
            style={props.style}
            className={props.className}
            fill={props.fill}
            viewBox='0.98 0.6 22.03 18'
            role='img'
        >
            <path d='M0.984375 18.6001L23.0156 18.6001L23.0156 0.600098L0.984375 0.600098L0.984375 18.6001ZM21 16.5845L3 16.5845L3 7.58447L21 7.58447V16.5845ZM11.0156 5.61572H8.01563V2.61572H11.0156V5.61572ZM3 5.61572L3 2.61572H6L6 5.61572H3ZM12.9844 2.61572L15.9844 2.61572V5.61572H12.9844V2.61572ZM18 2.61572H21V5.61572H18V2.61572Z'/>
        </svg>

    );
}
