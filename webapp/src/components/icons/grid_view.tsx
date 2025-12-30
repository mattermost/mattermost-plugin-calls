// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {CSSProperties} from 'react';

type Props = {
    className?: string,
    fill?: string,
    style?: CSSProperties,
}

export default function GridViewIcon(props: Props) {
    return (
        <svg
            style={props.style}
            className={props.className}
            fill={props.fill}
            viewBox='0.02 0.62 19.97 19.97'
            role='img'
        >
            <path d='M1.98438 20.5845L18.0156 20.5845C18.5469 20.5845 19 20.3813 19.375 19.9751C19.7812 19.6001 19.9844 19.147 19.9844 18.6157L19.9844 2.58447C19.9844 2.05322 19.7813 1.6001 19.375 1.2251C19 0.818848 18.5469 0.615723 18.0156 0.615723L1.98438 0.615723C1.45313 0.615723 0.984375 0.818848 0.578125 1.2251C0.203125 1.6001 0.015625 2.05322 0.015625 2.58447L0.015625 18.6157C0.015625 19.147 0.203125 19.6001 0.578125 19.9751C0.984375 20.3813 1.45313 20.5845 1.98438 20.5845ZM1.98438 18.6157L1.98438 11.5845L9.01563 11.5845L9.01562 18.6157H1.98438ZM1.98438 2.58447H9.01563V9.61572L1.98438 9.61572L1.98438 2.58447ZM18.0156 2.58447L18.0156 9.61572H10.9844V2.58447L18.0156 2.58447ZM18.0156 18.6157L10.9844 18.6157L10.9844 11.5845H18.0156V18.6157Z'/>
        </svg>

    );
}
