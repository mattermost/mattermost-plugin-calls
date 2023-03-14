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
            width='30px'
            height='28px'
            viewBox='0 0 30 28'
            role='img'
        >
            <path d='M29.6875 3.23248V19.2325C29.6875 19.9825 29.4167 20.6283 28.875 21.17C28.375 21.67 27.75 21.92 27 21.92H19V19.2325H27V3.23248H2.99999V19.2325H11V21.92H2.99999C2.24999 21.92 1.60416 21.67 1.06249 21.17C0.562494 20.6283 0.312494 19.9825 0.312494 19.2325V3.23248C0.312494 2.52415 0.562494 1.91998 1.06249 1.41998C1.60416 0.878316 2.24999 0.607483 2.99999 0.607483H27C27.75 0.607483 28.375 0.878316 28.875 1.41998C29.4167 1.91998 29.6875 2.52415 29.6875 3.23248ZM16.3125 15.2325H20.3125L15 9.91998L9.68749 15.2325H13.6875V24.6075H9.68749V27.2325H20.3125V24.6075H16.3125V15.2325Z'/>
        </svg>
    );
}
